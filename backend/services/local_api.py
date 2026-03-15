"""
Client for the local Hunyuan3D-V2.1 lab API at LAB_API_BASE_URL.

API contract (per project spec):
  POST /generate          multipart: image (file), caption, seed, octree_resolution, steps
                          → { job_id: str }
  GET  /status/{job_id}   → { status: "pending"|"running"|"done"|"failed", output_filename?: str }
  GET  /outputs/{filename} → GLB bytes (binary)
"""

import gc
import hashlib
import io
import json
import math
import os
import tempfile
import time
from pathlib import Path
from typing import Callable

from PIL import Image
import torch
import trimesh


LAB_API_BASE_URL = os.getenv("LAB_API_BASE_URL", "http://dh2020pc01.utm.utoronto.ca:8000")


# ── Determinism ──────────────────────────────────────────────────────────────

def set_determinism(seed: int) -> None:
    """
    Lock all sources of randomness for deterministic inference.
    Safe to call even if torch is not installed.
    """
    import random
    random.seed(seed)

    try:
        import numpy as np
        np.random.seed(seed)
    except ImportError:
        pass

    try:
        import torch
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False
    except ImportError:
        pass


# ── Model Weight Hash ────────────────────────────────────────────────────────

def get_model_weight_hash() -> str:
    """
    Returns sha256:{hash} identifying the current model weights.

    Priority:
    1. LOCAL_MODEL_WEIGHT_HASH env var (hardcoded override)
    2. Hash all .bin / .safetensors files at LOCAL_MODEL_PATH
    3. Fallback: sha256 of LOCAL_MODEL_VERSION string
    """
    override = os.getenv("LOCAL_MODEL_WEIGHT_HASH")
    if override:
        return override if override.startswith("sha256:") else f"sha256:{override}"

    model_path = os.getenv("LOCAL_MODEL_PATH")
    if model_path:
        path = Path(model_path)
        if path.exists():
            h = hashlib.sha256()
            weight_files = sorted(
                f for f in path.rglob("*")
                if f.is_file() and f.suffix in (".bin", ".safetensors")
            )
            for wf in weight_files:
                try:
                    h.update(wf.read_bytes())
                except OSError:
                    pass
            if weight_files:
                return f"sha256:{h.hexdigest()}"

    model_version = os.getenv("LOCAL_MODEL_VERSION", "hunyuan3d-v2.1")
    return f"sha256:{hashlib.sha256(model_version.encode()).hexdigest()}"


# ── Version Guard ────────────────────────────────────────────────────────────

def verify_model_version(manifest: dict, asset_dir: Path) -> bool:
    """
    Compare manifest's stored model_weight_hash against the current hash.
    On mismatch, writes validation_report.json to asset_dir.
    Returns True if stable, False if mismatch detected.
    """
    stored_hash = manifest.get("model_weight_hash", "")
    current_hash = get_model_weight_hash()

    if stored_hash == current_hash:
        return True

    report = {
        "seed_stable": False,
        "reason": "model_weight_mismatch",
        "expected": stored_hash,
        "actual": current_hash,
        "model_version": manifest.get("model_version"),
    }
    (asset_dir / "validation_report.json").write_text(json.dumps(report, indent=2))
    return False


# ── Lab API Client ───────────────────────────────────────────────────────────

def submit_generation_job(
    image_data: bytes,
    caption: str | None,
    seed: int,
    octree_resolution: int = 128,
    steps: int = 30,
    guidance_scale: float = 5.0,
) -> str:
    """
    Submit a generation job to the lab API.
    Returns the job_id string.
    Raises RuntimeError on HTTP error.
    """
    import httpx

    files = {}
    if image_data:
        files["image"] = ("input.png", image_data, "image/png")

    data = {
        "caption": caption or "",
        "seed": str(seed),
        "octree_resolution": str(octree_resolution),
        "steps": str(steps),
        "guidance_scale": str(guidance_scale),
    }

    resp = httpx.post(
        f"{LAB_API_BASE_URL}/generate",
        files=files if files else None,
        data=data,
        timeout=30.0,
    )
    if resp.status_code != 200:
        raise RuntimeError(
            f"Lab API /generate returned {resp.status_code}: {resp.text[:300]}"
        )
    return resp.json()["job_id"]


def poll_job_status(job_id: str) -> dict:
    """
    Poll job status. Returns dict with at minimum {"status": str}.
    Raises RuntimeError on HTTP error.
    """
    import httpx

    resp = httpx.get(f"{LAB_API_BASE_URL}/status/{job_id}", timeout=15.0)
    if resp.status_code != 200:
        raise RuntimeError(
            f"Lab API /status/{job_id} returned {resp.status_code}: {resp.text[:200]}"
        )
    return resp.json()


def download_glb(output_filename: str) -> bytes:
    """Download a finished GLB from the lab's /outputs endpoint."""
    import httpx

    resp = httpx.get(
        f"{LAB_API_BASE_URL}/outputs/{output_filename}",
        timeout=60.0,
        follow_redirects=True,
    )
    if resp.status_code != 200:
        raise RuntimeError(
            f"Lab API /outputs/{output_filename} returned {resp.status_code}"
        )
    return resp.content


def generate_and_await(
    image_data: bytes,
    caption: str | None,
    seed: int,
    octree_resolution: int = 128,
    steps: int = 30,
    guidance_scale: float = 5.0,
    status_callback: Callable[[str], None] | None = None,
    poll_interval: float = 5.0,
    timeout: float = 120.0,
) -> bytes:
    """
    Full pipeline: submit → poll (with 30s status callbacks) → download → return GLB bytes.

    status_callback: optional callable(message: str) called every 30s with a progress update.
    Raises RuntimeError on timeout or job failure.
    """
    job_id = submit_generation_job(image_data, caption, seed, octree_resolution, steps, guidance_scale)

    start = time.monotonic()
    last_callback = start

    while True:
        elapsed = time.monotonic() - start
        if elapsed > timeout:
            raise RuntimeError(f"Job {job_id} timed out after {timeout}s")

        status_info = poll_job_status(job_id)
        status = status_info.get("status", "unknown")

        # Emit 30-second status updates
        now = time.monotonic()
        if status_callback and (now - last_callback) >= 30.0:
            status_callback(f"Job {job_id} status={status} elapsed={elapsed:.0f}s")
            last_callback = now

        if status == "done":
            output_filename = status_info.get("output_filename")
            if not output_filename:
                raise RuntimeError(f"Job {job_id} done but no output_filename in response")
            return download_glb(output_filename)

        if status == "failed":
            raise RuntimeError(f"Job {job_id} failed: {status_info.get('error', 'unknown error')}")

        time.sleep(poll_interval)


def generate_and_paint_asset(image_bytes: bytes, object_name: str) -> bytes:
    """
    Two-stage Hunyuan3D-2 pipeline: shape generation → texturing.
    Designed for a single RTX 4080 (16 GB VRAM) with strict memory management.

    Stage A: Hunyuan3DDiTFlowMatchingPipeline → bare mesh (mc_resolution=128)
    Stage B: Hunyuan3DPaintPipeline → textured GLB bytes

    Returns raw GLB bytes of the fully textured mesh.
    """
    import gc
    import io
    import tempfile

    from PIL import Image

    # Load input image
    pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    # ── Stage A: Shape generation ─────────────────────────────────────────────
    try:
        from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
    except ImportError:
        raise RuntimeError(
            "hy3dgen not installed. Run: pip install git+https://github.com/tencent/Hunyuan3D-2.git"
        )

    shape_pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
        "tencent/Hunyuan3D-2",
        subfolder="hunyuan3d-dit-v2-0",
        use_safetensors=True,
    )
    shape_pipeline = shape_pipeline.to("cuda" if torch.cuda.is_available() else "cpu")

    bare_mesh = shape_pipeline(
        image=pil_image,
        num_inference_steps=30,
        mc_resolution=128,        # Speed hack: 50% of default 256
        octree_resolution=128,    # Speed hack: avoids 30s volume-decode hang
        output_type="trimesh",
    )[0]

    # VRAM flush between stages
    del shape_pipeline
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    # ── Stage B: Texturing ────────────────────────────────────────────────────
    try:
        from hy3dgen.texgen import Hunyuan3DPaintPipeline
    except ImportError:
        raise RuntimeError("hy3dgen texgen not available.")

    paint_pipeline = Hunyuan3DPaintPipeline.from_pretrained(
        "tencent/Hunyuan3D-2",
        subfolder="hunyuan3d-paint-v2-0-turbo",
    )
    paint_pipeline = paint_pipeline.to("cuda" if torch.cuda.is_available() else "cpu")

    textured_mesh = paint_pipeline(
        mesh=bare_mesh,
        image=pil_image,
    )[0]

    # Export to GLB bytes
    with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    try:
        textured_mesh.export(str(tmp_path))
        glb_bytes = tmp_path.read_bytes()
    finally:
        tmp_path.unlink(missing_ok=True)
        del paint_pipeline, textured_mesh, bare_mesh
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    return glb_bytes


def reconstruct_textured_room_shell(
    pano_bytes: bytes,
    ceil_bytes: bytes,
    flr_bytes: bytes,
    rec_id: str,
) -> tuple[bytes, dict]:
    """
    Build a texture-mapped room box from a 360° panorama.

    Steps:
    1. Run OrbitalReconstructor to get metric room dimensions.
       Fallback to (4.0, 2.5, 4.0) if reconstruction confidence is low
       (feature_density < 0.002) or if reconstruction fails.
    2. Create a trimesh box and invert normals (view from inside).
    3. Compute equirectangular UV mapping per vertex.
    4. Apply panorama as texture via TextureVisuals.
    5. Export to GLB bytes.
    6. Return (glb_bytes, manifest_dict).
    """
    import importlib
    import logging

    import numpy as np
    import trimesh.visual

    # ── Step 1: Dimensions ────────────────────────────────────────────────────
    FALLBACK_W, FALLBACK_H, FALLBACK_D = 4.0, 2.5, 4.0
    width, height, depth = FALLBACK_W, FALLBACK_H, FALLBACK_D
    confidence = 0.0

    try:
        orbital_mod = None
        for mod_path in [
            "services.orbital_reconstructor",
            "app.services.orbital_reconstructor",
            "orbital_reconstructor",
        ]:
            try:
                orbital_mod = importlib.import_module(mod_path)
                break
            except ImportError:
                continue

        if orbital_mod is not None:
            rec = orbital_mod.OrbitalReconstructor()
            import tempfile as _tf
            with _tf.TemporaryDirectory() as tmpdir:
                geom = rec.reconstruct(
                    pano_bytes, ceil_bytes, flr_bytes,
                    project_dir=Path(tmpdir),
                )
            confidence = getattr(geom, "confidence_score", 0.0)
            pair_results = getattr(geom, "pair_results", [])
            total_matches = sum(p.get("n_matches", 0) for p in pair_results)
            n_pairs = max(len(pair_results), 1)
            feature_density = total_matches / n_pairs / 10000.0
            if feature_density >= 0.002 and geom.width > 0.5 and geom.depth > 0.5:
                width = geom.width
                height = geom.height
                depth = geom.depth
            else:
                logging.getLogger(__name__).warning(
                    "reconstruct_textured_room_shell: low feature density %.4f "
                    "(confidence=%.3f) — using fallback dimensions %.1f×%.1f×%.1f",
                    feature_density, confidence, FALLBACK_W, FALLBACK_H, FALLBACK_D,
                )
        else:
            logging.getLogger(__name__).warning(
                "OrbitalReconstructor not found — using fallback room dimensions"
            )
    except Exception as exc:
        logging.getLogger(__name__).warning(
            "reconstruct_textured_room_shell: reconstruction failed (%s) — "
            "using fallback dimensions", exc
        )

    # ── Step 2: Build inverted box ────────────────────────────────────────────
    mesh = trimesh.creation.box(extents=[width, height, depth])
    mesh.faces = mesh.faces[:, ::-1]

    # ── Step 3: Equirectangular UV mapping ────────────────────────────────────
    verts = mesh.vertices.copy()
    norms = np.linalg.norm(verts, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1.0, norms)
    unit = verts / norms

    x_v, y_v, z_v = unit[:, 0], unit[:, 1], unit[:, 2]
    u = 0.5 + np.arctan2(z_v, x_v) / (2.0 * math.pi)
    v = 0.5 - np.arcsin(np.clip(y_v, -1.0, 1.0)) / math.pi

    uvs = np.stack([u, v], axis=1)

    # ── Step 4: Apply panorama texture ───────────────────────────────────────
    pano_image = Image.open(io.BytesIO(pano_bytes)).convert("RGB")

    texture = trimesh.visual.texture.TextureVisuals(
        uv=uvs,
        image=pano_image,
    )
    mesh.visual = texture

    # ── Step 5: Export to GLB bytes ───────────────────────────────────────────
    with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    try:
        mesh.export(str(tmp_path))
        glb_bytes = tmp_path.read_bytes()
    finally:
        tmp_path.unlink(missing_ok=True)

    # ── Step 6: Manifest ──────────────────────────────────────────────────────
    manifest_dict = {
        "reconstruction_id": rec_id,
        "room_geometry": {
            "width": width,
            "height": height,
            "depth": depth,
            "confidence_score": confidence,
            "fallback_used": (width == FALLBACK_W and height == FALLBACK_H and depth == FALLBACK_D),
        },
        "coordinate_system": {
            "origin": "centre of room",
            "x": "right",
            "y": "up",
            "z": "forward",
        },
    }

    gc.collect()
    return glb_bytes, manifest_dict
