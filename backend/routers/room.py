import asyncio
import uuid
from typing import Optional

from fastapi import APIRouter, Form, UploadFile, File, HTTPException

from services.sfm import reconstruct_room

router = APIRouter(prefix="/reconstruct-room", tags=["room"])

# Standard assumed ceiling height when no ceiling/floor shots are provided
_DEFAULT_HEIGHT_M = 2.7


@router.post("")
async def reconstruct_room_endpoint(
    panorama: UploadFile = File(...),
    ceiling: Optional[UploadFile] = File(None),
    floor: Optional[UploadFile] = File(None),
    project_id: Optional[str] = Form(None),
):
    """
    Reconstruct room dimensions from a panorama image.

    ceiling and floor uploads are optional — when omitted the endpoint assumes
    a standard flat ceiling at 2.7 m.
    """
    if not panorama.content_type or not panorama.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="'panorama' must be an image file")

    pano_bytes = await panorama.read()

    # Build image dict for sfm.reconstruct_room.
    # Panorama is used as a stand-in for all wall faces; ceiling/floor are
    # optional — absent views default to the panorama itself so the depth
    # estimator has something to work with, while height falls back to the
    # standard 2.7 m assumption.
    ceiling_bytes = (await ceiling.read()) if ceiling else pano_bytes
    floor_bytes   = (await floor.read())   if floor   else pano_bytes

    images = {
        "front":   pano_bytes,
        "back":    pano_bytes,
        "left":    pano_bytes,
        "right":   pano_bytes,
        "ceiling": ceiling_bytes,
        "floor":   floor_bytes,
    }

    result = await asyncio.to_thread(reconstruct_room, images)

    # Override height with sensible default when no ceiling/floor provided
    if ceiling is None and floor is None:
        result["height_m"] = _DEFAULT_HEIGHT_M

    scene_id = project_id or str(uuid.uuid4())
    room_dims = {
        "width_m":      result["width_m"],
        "depth_m":      result["depth_m"],
        "height_m":     result["height_m"],
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
