"""
Test /reconstruct-room endpoint.

Usage:
    python test_room.py [base_url]

Expects room photos under examples/ named:
    front.jpg, back.jpg, left.jpg, right.jpg, ceiling.jpg, floor.jpg
    (or .png variants — any missing view falls back to examples/cabinet.png)

Outputs:
    - Prints room_geometry dimensions from the API result
    - Saves room.glb (box mesh sized to the returned dimensions)
"""
import sys
import time
import json
from pathlib import Path

import requests

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
EXAMPLES = Path(__file__).parent / "examples"
FALLBACK = EXAMPLES / "cabinet.png"
POLL_INTERVAL = 3   # seconds between task polls
POLL_TIMEOUT = 300  # seconds before giving up


def find_image(view: str) -> Path:
    """Return examples/{view}.{jpg,png}, falling back to cabinet.png."""
    for ext in ("jpg", "jpeg", "png"):
        p = EXAMPLES / f"example_{view}.{ext}"
        if p.exists():
            return p
    print(f"  [warn] No {view} image found in {EXAMPLES}, using {FALLBACK.name} as placeholder")
    return FALLBACK


def post_reconstruct_room() -> str:
    views = ["front", "back", "left", "right", "ceiling", "floor"]
    files = {}
    opened = []
    try:
        for view in views:
            path = find_image(view)
            f = open(path, "rb")
            opened.append(f)
            mime = "image/jpeg" if path.suffix.lower() in (".jpg", ".jpeg") else "image/png"
            files[view] = (path.name, f, mime)

        print(f"\nPOST {BASE_URL}/reconstruct-room ...")
        resp = requests.post(
            f"{BASE_URL}/map-room",
            files=files,
            timeout=30,
        )
    finally:
        for f in opened:
            f.close()

    resp.raise_for_status()
    data = resp.json()
    task_id = data["task_id"]
    print(f"  task_id: {task_id}  status: {data['status']}")
    return task_id


def poll_task(task_id: str) -> dict:
    deadline = time.time() + POLL_TIMEOUT
    while time.time() < deadline:
        resp = requests.get(f"{BASE_URL}/tasks/{task_id}", timeout=10)
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status")
        print(f"  [{status}] polling task {task_id} ...")
        if status == "done":
            return data["result"]
        if status == "failed":
            raise RuntimeError(f"Task failed: {data.get('error')}")
        time.sleep(POLL_INTERVAL)
    raise TimeoutError(f"Task {task_id} did not complete within {POLL_TIMEOUT}s")


def save_room_glb(width_m: float, depth_m: float, height_m: float, out: Path) -> None:
    """Build a simple open-top box mesh from room dimensions and export as GLB."""
    try:
        import trimesh
        import numpy as np

        # Build floor + 4 walls as individual boxes then merge
        thickness = 0.05  # 5 cm walls/floor

        def box(extents, translation):
            m = trimesh.creation.box(extents=extents)
            m.apply_translation(translation)
            return m

        floor   = box([width_m, depth_m, thickness], [width_m/2, depth_m/2, 0])
        wall_f  = box([width_m, thickness, height_m], [width_m/2, depth_m, height_m/2])
        wall_b  = box([width_m, thickness, height_m], [width_m/2, 0,       height_m/2])
        wall_l  = box([thickness, depth_m, height_m], [0,         depth_m/2, height_m/2])
        wall_r  = box([thickness, depth_m, height_m], [width_m,   depth_m/2, height_m/2])

        room_mesh = trimesh.util.concatenate([floor, wall_f, wall_b, wall_l, wall_r])
        room_mesh.export(str(out))
        print(f"\n  GLB saved → {out}  ({out.stat().st_size:,} bytes)")
    except ImportError:
        print("\n  [warn] trimesh not installed — skipping GLB export")
        print("         Install with: pip install trimesh")


def main():
    task_id = post_reconstruct_room()
    result = poll_task(task_id)

    dims = result.get("dimensions_m") or {
        "width":  result.get("width_m"),
        "depth":  result.get("depth_m"),
        "height": result.get("height_m"),
    }
    floor_area = result.get("floor_area_m2")
    scene_id   = result.get("scene_id", "n/a")

    print("\n── Room Geometry ─────────────────────────────")
    print(f"  scene_id     : {scene_id}")
    print(f"  width_m      : {dims.get('width')}")
    print(f"  depth_m      : {dims.get('depth')}")
    print(f"  height_m     : {dims.get('height')}")
    print(f"  floor_area_m2: {floor_area}")
    print("  bounding_box :")
    for pt in result.get("bounding_box", []):
        print(f"    {pt}")
    print("──────────────────────────────────────────────\n")
    print("Full result JSON:")
    print(json.dumps(result, indent=2))

    # Generate and save GLB
    out_glb = Path(__file__).parent / "room.glb"
    save_room_glb(
        width_m  = float(dims.get("width")  or 4.0),
        depth_m  = float(dims.get("depth")  or 4.0),
        height_m = float(dims.get("height") or 2.5),
        out=out_glb,
    )


if __name__ == "__main__":
    main()
