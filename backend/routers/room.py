import asyncio
import uuid

from fastapi import APIRouter, UploadFile, File, HTTPException

from services.sfm import reconstruct_room

router = APIRouter(prefix="/reconstruct-room", tags=["room"])


@router.post("")
async def reconstruct_room_endpoint(
    front: UploadFile = File(...),
    back: UploadFile = File(...),
    left: UploadFile = File(...),
    right: UploadFile = File(...),
    ceiling: UploadFile = File(...),
    floor: UploadFile = File(...),
    project_id: str = None,   # optional: attach to existing project
):
    """Reconstruct room dimensions from 6 wall images."""
    images = {}
    for name, upload in [("front", front), ("back", back), ("left", left),
                         ("right", right), ("ceiling", ceiling), ("floor", floor)]:
        if not upload.content_type or not upload.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail=f"'{name}' must be an image file")
        images[name] = await upload.read()

    result = await asyncio.to_thread(reconstruct_room, images)

    scene_id = project_id or str(uuid.uuid4())
    room_dims = {
        "width_m": result["width_m"],
        "depth_m": result["depth_m"],
        "height_m": result["height_m"],
        "floor_area_m2": result.get("floor_area_m2"),
    }

    try:
        from services.storage_manager import StorageManager
        sm = StorageManager(scene_id)
        sm.set_room_dimensions(room_dims)
    except Exception as e:
        print(f"[room] StorageManager save failed (non-fatal): {e}")

    return {
        "scene_id": scene_id,
        "dimensions_m": room_dims,
        "bounding_box": result.get("bounding_box"),
    }
