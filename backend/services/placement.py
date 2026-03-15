import random
import numpy as np


def place_assets(room: dict, assets: list[dict]) -> list[dict]:
    """
    Greedily place 3D assets on the floor of a room, avoiding collisions.

    Args:
        room: { "width_m": float, "depth_m": float, "height_m": float }
        assets: list of {
            "asset_id": str,
            "glb_path": str | None,
            "dimensions_m": [w, d, h] | None,
            "caption": str | None,
            "product_url": str | None,
            "type": str | None,
        }

    Returns: list of placed objects with world coordinates, rotation, scale:
    [
        {
            "mesh_id": str,
            "asset_id": str,
            "product_url": str | None,
            "type": str,
            "world_coordinates": [x, y, z],  # center of object on floor
            "rotation": [0, 0, 0],            # [rx, ry, rz] in radians
            "scale": [sx, sy, sz],
        }
    ]
    """
    room_w = float(room.get("width_m", 4.0))
    room_d = float(room.get("depth_m", 4.0))

    def _get_physical_size(asset: dict):
        """Load GLB or fall back to dimensions_m / default box. Returns (physical_size, scale)."""
        dimensions_m = asset.get("dimensions_m")
        glb_path = asset.get("glb_path")

        model_size = None
        if glb_path:
            try:
                import trimesh
                mesh = trimesh.load(glb_path, force="mesh")
                bounds = mesh.bounds  # [[xmin,ymin,zmin],[xmax,ymax,zmax]]
                raw = bounds[1] - bounds[0]
                model_size = np.where(raw < 1e-6, 1.0, raw)
            except Exception:
                model_size = None

        if model_size is None:
            model_size = np.array([1.0, 1.0, 1.0])

        if dimensions_m and len(dimensions_m) == 3:
            dims = np.array([float(d) if d else 0.5 for d in dimensions_m])
            dims = np.where(dims < 1e-6, 0.5, dims)
            scale = (dims / model_size).tolist()
            physical_size = dims.tolist()
        else:
            max_dim = float(np.max(model_size))
            uniform_scale = 0.5 / max_dim
            scale = [uniform_scale] * 3
            physical_size = (model_size * uniform_scale).tolist()

        return physical_size, scale

    def _volume(asset):
        dims = asset.get("dimensions_m")
        if dims and len(dims) == 3:
            return dims[0] * dims[1] * dims[2]
        return 0.0

    sorted_assets = sorted(assets, key=_volume, reverse=True)

    GRID_STEP = 0.3
    MARGIN = 0.1

    placed_rects = []  # list of (cx, cz, half_w, half_d)
    results = []

    for asset in sorted_assets:
        physical_size, scale = _get_physical_size(asset)
        pw = physical_size[0]
        pd = physical_size[2] if len(physical_size) > 2 else physical_size[0]
        ph = physical_size[1]

        half_w = pw / 2.0
        half_d = pd / 2.0

        def _overlaps(cx, cz, hw=half_w, hd=half_d):
            for (ox, oz, ohw, ohd) in placed_rects:
                if (abs(cx - ox) < hw + ohw + MARGIN and
                        abs(cz - oz) < hd + ohd + MARGIN):
                    return True
            return False

        placed_pos = None

        x = half_w
        while x + half_w <= room_w:
            z = half_d
            while z + half_d <= room_d:
                if not _overlaps(x, z):
                    placed_pos = (x, z)
                    break
                z += GRID_STEP
            if placed_pos:
                break
            x += GRID_STEP

        if placed_pos is None:
            cx = room_w / 2.0 + random.uniform(-0.2, 0.2)
            cz = room_d / 2.0 + random.uniform(-0.2, 0.2)
            placed_pos = (cx, cz)

        cx, cz = placed_pos
        cy = ph / 2.0

        placed_rects.append((cx, cz, half_w, half_d))

        results.append({
            "mesh_id": asset.get("asset_id", ""),
            "asset_id": asset.get("asset_id", ""),
            "product_url": asset.get("product_url"),
            "type": asset.get("type") or "unknown",
            "world_coordinates": [round(cx, 4), round(cy, 4), round(cz, 4)],
            "rotation": [0, 0, 0],
            "scale": [round(s, 6) for s in scale],
        })

    return results
