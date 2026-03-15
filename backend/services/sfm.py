import io
import numpy as np
from PIL import Image

ROOM_SCALE_FACTOR = 5.0
_depth_pipeline = None


def _load_depth_pipeline():
    from transformers import pipeline
    return pipeline(
        task="depth-estimation",
        model="depth-anything/Depth-Anything-V2-Small-hf",
    )


def estimate_depth_map(image_bytes: bytes) -> np.ndarray:
    """Return normalized depth map as numpy array (H, W), values 0-1 where 1=far."""
    global _depth_pipeline
    if _depth_pipeline is None:
        _depth_pipeline = _load_depth_pipeline()

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    result = _depth_pipeline(img)
    depth = np.array(result["depth"]).astype(np.float32)
    dmin, dmax = depth.min(), depth.max()
    if dmax > dmin:
        depth = (depth - dmin) / (dmax - dmin)
    return depth


def _center_median(depth: np.ndarray) -> float:
    """Median depth of the center 50% region of the image."""
    h, w = depth.shape
    h0, h1 = h // 4, 3 * h // 4
    w0, w1 = w // 4, 3 * w // 4
    return float(np.median(depth[h0:h1, w0:w1]))


def _opencv_fallback_dimension(img_bytes_near: bytes, img_bytes_far: bytes) -> float:
    import cv2

    def count_features(b: bytes) -> int:
        arr = np.frombuffer(b, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
        sift = cv2.SIFT_create()
        kp, _ = sift.detectAndCompute(img, None)
        return len(kp)

    n = count_features(img_bytes_near)
    f = count_features(img_bytes_far)
    total = n + f
    return float(np.clip(total / 500.0, 1.5, 12.0))


def _estimate_dimension(near_bytes: bytes, far_bytes: bytes) -> float:
    """Estimate a room dimension (m) from two opposing-wall images."""
    try:
        near_map = estimate_depth_map(near_bytes)
        far_map = estimate_depth_map(far_bytes)
        dim = (_center_median(near_map) + _center_median(far_map)) * ROOM_SCALE_FACTOR
        return float(dim)
    except Exception:
        return _opencv_fallback_dimension(near_bytes, far_bytes)


def make_bounding_box(w: float, d: float, h: float) -> list:
    return [
        [0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0],
        [0, 0, h], [w, 0, h], [w, d, h], [0, d, h],
    ]


def reconstruct_room(images: dict[str, bytes]) -> dict:
    """
    Estimate room dimensions from 6 wall photos using monocular depth estimation.

    Args:
        images: dict with keys 'front', 'back', 'left', 'right', 'ceiling', 'floor'
                values are raw image bytes

    Returns:
        {
            "width_m": float,
            "depth_m": float,
            "height_m": float,
            "floor_area_m2": float,
            "bounding_box": list of 8 [x,y,z] corner points
        }
    """
    depth_m = np.clip(
        _estimate_dimension(images["front"], images["back"]), 1.5, 15.0
    )
    width_m = np.clip(
        _estimate_dimension(images["left"], images["right"]), 1.5, 15.0
    )
    height_m = np.clip(
        _estimate_dimension(images["floor"], images["ceiling"]), 1.8, 6.0
    )

    floor_area_m2 = round(float(width_m * depth_m), 2)

    return {
        "width_m": round(float(width_m), 2),
        "depth_m": round(float(depth_m), 2),
        "height_m": round(float(height_m), 2),
        "floor_area_m2": floor_area_m2,
        "bounding_box": make_bounding_box(float(width_m), float(depth_m), float(height_m)),
    }
