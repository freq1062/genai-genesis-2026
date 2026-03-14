import base64
import json
import os
import uuid

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from celery_app import celery

router = APIRouter(prefix="/generate-asset", tags=["generate"])


@router.post("")
async def generate_asset_endpoint(
    file: UploadFile = File(...),
    caption: str = Form(None),
    dimensions_m: str = Form(None),  # JSON array string: "[0.6, 0.6, 0.9]"
    seed: int = Form(1234),
):
    """
    Queue a 3D asset generation task.

    - file: product image
    - caption: optional text description
    - dimensions_m: optional JSON array [width, depth, height] in meters
    - seed: generation seed

    Returns { task_id, status }
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    image_data = await file.read()
    dims = None
    if dimensions_m:
        try:
            dims = json.loads(dimensions_m)
        except Exception:
            raise HTTPException(status_code=400, detail="dimensions_m must be a JSON array of floats")

    image_data_b64 = base64.b64encode(image_data).decode()
    task = generate_asset_task.delay(
        image_data_b64=image_data_b64,
        caption=caption,
        dimensions_m=dims,
        seed=seed,
        content_type=file.content_type,
    )
    return {"task_id": task.id, "status": "pending"}


@celery.task(name="generate_asset_task", bind=True)
def generate_asset_task(self, image_data_b64: str, caption: str | None, dimensions_m: list | None, seed: int, content_type: str):
    """Celery task: generate GLB via local lab API, store in PostgreSQL + StorageManager."""
    import hashlib
    from services.local_api import generate_and_await, get_model_weight_hash
    from services.storage_manager import StorageManager

    image_data = base64.b64decode(image_data_b64)

    # Deterministic seed derived from image content for reproducibility
    det_seed = int(hashlib.sha256(image_data[:256] if image_data else b"text").hexdigest(), 16) % (2**31)

    octree_resolution = 256

    glb_bytes = generate_and_await(
        image_data=image_data,
        caption=None,
        seed=det_seed,
        octree_resolution=octree_resolution,
        steps=30,
        guidance_scale=5.0,
        status_callback=lambda msg: print(f"[generate] {msg}"),
    )

    asset_id = str(uuid.uuid4())
    glb_dir = os.path.join(os.path.dirname(__file__), "..", "generated_assets")
    os.makedirs(glb_dir, exist_ok=True)
    glb_path = os.path.join(glb_dir, f"{asset_id}.glb")
    with open(glb_path, "wb") as f:
        f.write(glb_bytes)

    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from db.postgres import Asset, Base

    sync_url = os.getenv("POSTGRES_URL", "postgresql+asyncpg://postgres:postgres@localhost/assetforge")
    sync_url = sync_url.replace("postgresql+asyncpg://", "postgresql://")

    try:
        sync_engine = create_engine(sync_url)
        Base.metadata.create_all(sync_engine)
        with Session(sync_engine) as session:
            asset = Asset(
                id=asset_id,
                task_id=self.request.id,
                object_name=caption or "unknown",
                category="generated",
                glb_path=glb_path,
                dimensions_m_json=dimensions_m,
            )
            session.add(asset)
            session.commit()
        sync_engine.dispose()
    except Exception as e:
        print(f"PostgreSQL storage failed (non-fatal): {e}")

    # Persist seed receipt + proxy mesh so the hydration pipeline can replay this asset
    project_asset = {}
    try:
        sm_project_id = str(uuid.uuid4())
        sm_asset_id = self.request.id
        sm = StorageManager(sm_project_id, sm_asset_id)

        inference_params = {
            "octree_resolution": octree_resolution,
            "steps": 30,
            "guidance_scale": 5.0,
        }

        sm.save_manifest(
            input_image_hash=hashlib.sha256(image_data).hexdigest() if image_data else "none",
            seed=det_seed,
            model_version=os.getenv("LOCAL_MODEL_VERSION", "hunyuan3d-v2.1"),
            model_weight_hash=get_model_weight_hash(),
            inference_params=inference_params,
        )

        sm.save_proxy(glb_bytes)

        project_asset = {"project_id": sm_project_id, "asset_id": sm_asset_id}
    except Exception as e:
        print(f"[generate] StorageManager non-fatal error: {e}")

    return {
        "asset_id": asset_id,
        "glb_path": glb_path,
        "glb_base64": base64.b64encode(glb_bytes).decode(),
        "dimensions_m": dimensions_m,
        "caption": caption,
        "project_id": project_asset.get("project_id"),
        "sm_asset_id": project_asset.get("asset_id"),
    }
