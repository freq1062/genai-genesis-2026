import asyncio
import base64
import hashlib
import json
import os
import uuid

from fastapi import APIRouter, UploadFile, File, Form, HTTPException

router = APIRouter(prefix="/generate-asset", tags=["generate"])


@router.post("")
async def generate_asset_endpoint(
    file: UploadFile = File(...),
    caption: str = Form(None),
    dimensions_m: str = Form(None),
    seed: int = Form(1234),
):
    """Generate a 3D asset synchronously via the local lab API."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    image_data = await file.read()
    dims = None
    if dimensions_m:
        try:
            dims = json.loads(dimensions_m)
        except Exception:
            raise HTTPException(status_code=400, detail="dimensions_m must be a JSON array")

    from services.local_api import generate_and_await, get_model_weight_hash
    from services.storage_manager import StorageManager

    det_seed = int(hashlib.sha256(image_data[:256]).hexdigest(), 16) % (2**31)
    octree_resolution = 256

    try:
        glb_bytes = await asyncio.to_thread(
            generate_and_await,
            image_data, caption, det_seed, octree_resolution, 30, 5.0,
            lambda msg: print(f"[generate-asset] {msg}"),
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=f"3D generation failed: {e}")

    project_id = str(uuid.uuid4())
    asset_id = str(uuid.uuid4())

    sm = StorageManager(project_id)
    sm.save_asset_manifest(
        asset_id=asset_id,
        input_image_hash=hashlib.sha256(image_data).hexdigest(),
        seed=det_seed,
        model_version=os.getenv("LOCAL_MODEL_VERSION", "hunyuan3d-v2.1"),
        model_weight_hash=get_model_weight_hash(),
        inference_params={"octree_resolution": octree_resolution, "steps": 30, "guidance_scale": 5.0},
    )
    sm.save_image(asset_id, image_data)
    sm.save_proxy(asset_id, glb_bytes)

    return {
        "project_id": project_id,
        "asset_id": asset_id,
        "dimensions_m": dims,
        "caption": caption,
    }
