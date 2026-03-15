import base64
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from celery_app import celery

router = APIRouter(prefix="/reconstruct-room", tags=["room"])


@router.post("")
async def reconstruct_room_endpoint(
    front: UploadFile = File(...),
    back: UploadFile = File(...),
    left: UploadFile = File(...),
    right: UploadFile = File(...),
    ceiling: UploadFile = File(...),
    floor: UploadFile = File(...),
):
    """
    Accept 6 wall images and queue room reconstruction.
    Returns task_id to poll for results.
    """
    images = {}
    for name, upload in [
        ("front", front), ("back", back), ("left", left),
        ("right", right), ("ceiling", ceiling), ("floor", floor),
    ]:
        if not upload.content_type or not upload.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail=f"'{name}' must be an image file")
        images[name] = await upload.read()

    images_b64 = {k: base64.b64encode(v).decode() for k, v in images.items()}
    task = reconstruct_room_task.delay(images_b64)
    return {"task_id": task.id, "status": "pending"}


@celery.task(name="reconstruct_room_task", bind=True)
def reconstruct_room_task(self, images_b64: dict):
    """Celery task: reconstruct room from 6 images, store Scene in PostgreSQL."""
    import os
    from services.sfm import reconstruct_room

    images = {k: base64.b64decode(v) for k, v in images_b64.items()}
    result = reconstruct_room(images)

    scene_id = str(uuid.uuid4())

    try:
        from sqlalchemy import create_engine
        from sqlalchemy.orm import Session
        from db.postgres import Scene, Base

        sync_url = os.getenv(
            "POSTGRES_URL",
            "postgresql+asyncpg://postgres:postgres@localhost/assetforge",
        ).replace("postgresql+asyncpg://", "postgresql://")

        sync_engine = create_engine(sync_url)
        Base.metadata.create_all(sync_engine)
        with Session(sync_engine) as session:
            scene = Scene(
                id=scene_id,
                dimensions_json={
                    "width_m": result["width_m"],
                    "depth_m": result["depth_m"],
                    "height_m": result["height_m"],
                    "floor_area_m2": result["floor_area_m2"],
                },
                bounding_box_json=result["bounding_box"],
            )
            session.add(scene)
            session.commit()
        sync_engine.dispose()
    except Exception as e:
        print(f"PostgreSQL Scene storage failed (non-fatal): {e}")

    return {
        "scene_id": scene_id,
        "dimensions_m": {
            "width": result["width_m"],
            "depth": result["depth_m"],
            "height": result["height_m"],
        },
        "floor_area_m2": result["floor_area_m2"],
        "bounding_box": result["bounding_box"],
    }
