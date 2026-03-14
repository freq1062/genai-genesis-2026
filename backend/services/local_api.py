"""
Client for the local Hunyuan3D-V2.1 lab API at LAB_API_BASE_URL.

API contract (per project spec):
  POST /generate          multipart: image (file), caption, seed, octree_resolution, steps
                          → { job_id: str }
  GET  /status/{job_id}   → { status: "pending"|"running"|"done"|"failed", output_filename?: str }
  GET  /outputs/{filename} → GLB bytes (binary)
"""

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Callable


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
    octree_resolution: int = 256,
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
    octree_resolution: int = 256,
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
