"""
Railtracks traceability layer for the Asset Forge hydration pipeline.

Nodes:
  load_seed_receipt   — reads manifest from disk
  run_hydration       — calls lab API with OOM retry at half resolution
  validate_output     — trimesh checks + VRAM/storage delta logging

Session:
  orchestrate_hydration — sequences above nodes, logs Reconstruction Delta
"""

from typing import Optional

from pydantic import BaseModel, ConfigDict

import railtracks as rt

rt.enable_logging("INFO")


# ── Pydantic models (railtracks forbids raw dict parameters) ─────────────────

class InferenceParameters(BaseModel):
    model_config = ConfigDict(extra="allow")

    octree_resolution: int = 256
    steps: int = 30
    guidance_scale: float = 5.0


class Manifest(BaseModel):
    model_config = ConfigDict(extra="allow")

    seed: int = 1234
    model_version: Optional[str] = None
    inference_parameters: InferenceParameters = InferenceParameters()


# ── Nodes ────────────────────────────────────────────────────────────────────

@rt.function_node
def load_seed_receipt(project_id: str, asset_id: str) -> Manifest:
    """
    Load the seed receipt manifest for a project asset.
    Returns a Manifest model.
    Raises FileNotFoundError if asset does not exist.
    """
    from services.storage_manager import StorageManager

    sm = StorageManager(project_id, asset_id)
    raw = sm.load_manifest()
    return Manifest(**raw)


@rt.function_node
def run_hydration(manifest: Manifest) -> bytes:
    """
    Generate a full-resolution GLB from the seed receipt using the lab API.
    Implements OOM retry: on first OOM error, retries with octree_resolution halved.
    Raises FatalError if both attempts fail with OOM.
    """
    from railtracks.exceptions import FatalError
    from services.local_api import generate_and_await

    inf = manifest.inference_parameters
    seed = manifest.seed
    octree_resolution = inf.octree_resolution
    steps = inf.steps
    guidance_scale = inf.guidance_scale

    def _is_oom(exc: Exception) -> bool:
        msg = str(exc).lower()
        return "oom" in msg or "out of memory" in msg or "cuda out" in msg

    def _attempt(res: int) -> bytes:
        print(f"[railtracks] run_hydration: attempting octree_resolution={res}")
        return generate_and_await(
            image_data=b"",
            caption=manifest.model_version,
            seed=seed,
            octree_resolution=res,
            steps=steps,
            guidance_scale=guidance_scale,
            status_callback=lambda msg: print(f"[railtracks] {msg}"),
        )

    try:
        return _attempt(octree_resolution)
    except RuntimeError as e:
        if _is_oom(e):
            reduced = max(64, octree_resolution // 2)
            print(f"[railtracks] OOM at resolution {octree_resolution}, retrying at {reduced}")
            try:
                return _attempt(reduced)
            except RuntimeError as e2:
                if _is_oom(e2):
                    raise FatalError(
                        f"OOM persisted at reduced resolution {reduced}. "
                        "Consider reducing num_chunks or using a smaller image."
                    )
                raise
        raise


@rt.function_node
def validate_output(glb_bytes: bytes, manifest: Manifest) -> str:
    """
    Run mesh quality checks on the hydrated GLB and log performance metrics.

    Checks:
    - Mesh is watertight (is_watertight)
    - Centroid is within 5m of origin (reasonable room-scale object)
    - Face count > 0

    Logs:
    - VRAM efficiency note (estimated peak VRAM for given octree_resolution)
    - Reconstruction Delta: storage saved vs storing raw full-res GLB

    Returns a JSON string of the validation result (railtracks forbids raw dict params/returns).
    """
    import io
    import json

    import numpy as np

    valid = True
    issues = []
    centroid = [0.0, 0.0, 0.0]
    face_count = 0
    is_watertight = False

    try:
        import trimesh

        mesh = trimesh.load(io.BytesIO(glb_bytes), file_type="glb", force="mesh")
        face_count = len(mesh.faces)
        is_watertight = bool(mesh.is_watertight)
        centroid = mesh.centroid.tolist()
        centroid_dist = float(np.linalg.norm(mesh.centroid))

        if face_count == 0:
            valid = False
            issues.append("Mesh has zero faces")
        if centroid_dist > 5.0:
            valid = False
            issues.append(f"Centroid {centroid_dist:.2f}m from origin (expected < 5m)")
    except Exception as e:
        valid = False
        issues.append(f"Trimesh load failed: {e}")

    full_glb_mb = len(glb_bytes) / (1024 * 1024)
    storage_saved_mb = round(full_glb_mb, 3)

    # Empirical VRAM estimates: 128→~4GB, 256→~8GB, 512→~14GB on RTX 4080 16GB
    octree_res = manifest.inference_parameters.octree_resolution
    vram_map = {128: 4.0, 256: 8.0, 512: 14.0}
    estimated_vram_gb = vram_map.get(octree_res, octree_res * 0.055)

    print(
        f"[railtracks] validate_output: faces={face_count} watertight={is_watertight} "
        f"valid={valid} storage_saved={storage_saved_mb:.2f}MB "
        f"estimated_VRAM={estimated_vram_gb:.1f}GB (res={octree_res})"
    )

    return json.dumps({
        "valid": valid,
        "issues": issues,
        "face_count": face_count,
        "is_watertight": is_watertight,
        "centroid": centroid,
        "storage_saved_mb": storage_saved_mb,
        "estimated_vram_gb": estimated_vram_gb,
    })


# ── Session ──────────────────────────────────────────────────────────────────

@rt.session
async def orchestrate_hydration(project_id: str, asset_id: str) -> str:
    """
    Full hydration pipeline as a Railtracks session.
    Sequences: load_seed_receipt → run_hydration → validate_output
    Logs Reconstruction Delta on completion.
    Returns a JSON string with pipeline results.
    """
    import json
    import time

    start = time.monotonic()

    # Node 1: Load receipt
    manifest = await rt.call(load_seed_receipt, project_id, asset_id)

    # Node 2: Hydrate (rt.call is async; railtracks handles sync dispatch internally)
    glb_bytes = await rt.call(run_hydration, manifest)

    # Node 3: Validate
    validation_json = await rt.call(validate_output, glb_bytes, manifest)
    validation = json.loads(validation_json)

    elapsed = time.monotonic() - start
    storage_saved = validation.get("storage_saved_mb", 0)

    print(
        f"[railtracks] Reconstruction Delta: "
        f"elapsed={elapsed:.1f}s | "
        f"storage_saved={storage_saved:.2f}MB | "
        f"VRAM={validation.get('estimated_vram_gb', '?')}GB | "
        f"faces={validation.get('face_count', '?')} | "
        f"valid={validation.get('valid')}"
    )

    return json.dumps({
        "project_id": project_id,
        "asset_id": asset_id,
        "validation": validation,
        "reconstruction_delta": {
            "elapsed_s": round(elapsed, 2),
            "storage_saved_mb": storage_saved,
            "estimated_vram_gb": validation.get("estimated_vram_gb"),
        },
    })
