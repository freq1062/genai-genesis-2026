"""
Batch test: POST /reconstruct-room for every panorama found in examples/.

Usage:
    python test_room.py [base_url]

Scans examples/ for files matching panorama*.jpg / panorama*.png (e.g. panorama1.jpg,
panorama2.jpg ...).  Falls back to examples/panorama.jpg if none are numbered.

Only the panorama is sent — ceiling and floor are omitted so the endpoint
assumes a standard flat ceiling/floor at 2.7 m.

Outputs per panorama (1-indexed):
    room{n}.glb           — box mesh sized to returned dimensions
    room{n}_manifest.json — full API response
"""
import json
import sys
from pathlib import Path

import requests

EXAMPLES = Path(__file__).parent / "examples"
BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
OUT_DIR  = Path(__file__).parent


def find_panoramas() -> list[Path]:
    """Return sorted list of panorama images from examples/."""
    # Numbered first: panorama1.jpg, panorama2.png …
    numbered = sorted(
        p for p in EXAMPLES.iterdir()
        if p.stem.startswith("panorama") and p.stem[8:].isdigit()
        and p.suffix.lower() in (".jpg", ".jpeg", ".png")
    )
    if numbered:
        return numbered
    # Fall back to plain panorama.jpg / panorama.png
    for ext in (".jpg", ".jpeg", ".png"):
        candidate = EXAMPLES / f"panorama{ext}"
        if candidate.exists():
            return [candidate]
    return []


def post_reconstruct(panorama_path: Path) -> dict:
    mime = "image/jpeg" if panorama_path.suffix.lower() in (".jpg", ".jpeg") else "image/png"
    image_bytes = panorama_path.read_bytes()
    # ceiling and floor are optional on the endpoint; send the panorama as
    # a dummy for both so depth estimation has something to work with.
    files = {
        "panorama": (panorama_path.name, image_bytes, mime),
        "ceiling":  (panorama_path.name, image_bytes, mime),
        "floor":    (panorama_path.name, image_bytes, mime),
    }
    resp = requests.post(
        f"{BASE_URL}/reconstruct-room",
        files=files,
        timeout=120,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"HTTP {resp.status_code}: {resp.text}")
    return resp.json()


def save_room_glb(width: float, depth: float, height: float, out: Path) -> None:
    if not width or not height or not depth:
        print(f"    [warn] Zero dimensions (w={width}, h={height}, d={depth}) — skipping GLB")
        return
    try:
        import trimesh

        t = 0.05  # wall/floor thickness

        def box(extents, translation):
            m = trimesh.creation.box(extents=extents)
            m.apply_translation(translation)
            return m

        # glTF Y-up convention: X=right, Y=up, Z=toward viewer
        # Width along X, height along Y, depth along Z
        # Origin at floor-level front-left corner
        mesh = trimesh.util.concatenate([
            box([width, t,      depth ], [width/2, -t/2,     depth/2]),  # floor top at y=0
            box([width, height, t     ], [width/2, height/2, 0      ]),  # front wall (z=0)
            box([width, height, t     ], [width/2, height/2, depth  ]),  # back wall  (z=depth)
            box([t,     height, depth ], [0,       height/2, depth/2]),  # left wall  (x=0)
            box([t,     height, depth ], [width,   height/2, depth/2]),  # right wall (x=width)
        ])
        if len(mesh.faces) == 0:
            print(f"    [warn] Empty mesh — skipping GLB export for {out.name}")
            return
        mesh.export(str(out))
        print(f"    GLB saved    -> {out.name}  ({out.stat().st_size:,} bytes)")
    except ImportError:
        print("    [warn] trimesh not installed -- skipping GLB (pip install trimesh)")


def print_result(data: dict) -> None:
    dims = data.get("dimensions_m") or {}
    width  = dims.get("width_m",  data.get("width",  0.0))
    depth  = dims.get("depth_m",  data.get("depth",  0.0))
    height = dims.get("height_m", data.get("height", 0.0))
    area   = dims.get("floor_area_m2", round(width * depth, 2))

    # New OrbitalReconstructor fields (present when that router is active)
    confidence       = data.get("confidence_score", None)
    reconstruction_id = data.get("reconstruction_id") or data.get("scene_id", "n/a")
    pair_results     = data.get("pair_results",     [])
    internal_objects = data.get("internal_objects", [])

    print(f"    id              : {reconstruction_id}")
    print(f"    width           : {width:.3f} m")
    print(f"    depth           : {depth:.3f} m")
    print(f"    height          : {height:.3f} m")
    print(f"    floor_area      : {area:.2f} m2")
    if confidence is not None:
        print(f"    confidence      : {confidence:.3f}")
    if pair_results:
        print(f"    slice_pairs     : {len(pair_results)}")
    if internal_objects:
        print(f"    internal_objects: {len(internal_objects)}")


def main():
    panoramas = find_panoramas()
    if not panoramas:
        print(f"No panorama images found in {EXAMPLES}")
        print("Expected: panorama1.jpg, panorama2.jpg ... or panorama.jpg")
        sys.exit(1)

    print(f"Found {len(panoramas)} panorama(s) in {EXAMPLES}")
    print(f"Endpoint: {BASE_URL}/reconstruct-room\n")

    passed = 0
    failed = 0

    for idx, pano_path in enumerate(panoramas, start=1):
        print(f"[{idx}/{len(panoramas)}] {pano_path.name}")
        try:
            data = post_reconstruct(pano_path)
            print_result(data)

            # Determine dimensions for GLB (support both response schemas)
            dims   = data.get("dimensions_m") or {}
            width  = float(dims.get("width_m",  data.get("width",  4.0)) or 4.0)
            depth  = float(dims.get("depth_m",  data.get("depth",  4.0)) or 4.0)
            height = float(dims.get("height_m", data.get("height", 2.7)) or 2.7)

            glb_path      = OUT_DIR / f"room{idx}.glb"
            manifest_path = OUT_DIR / f"room{idx}_manifest.json"

            save_room_glb(width, depth, height, glb_path)
            manifest_path.write_text(json.dumps(data, indent=2))
            print(f"    Manifest saved -> {manifest_path.name}")
            passed += 1

        except Exception as exc:
            print(f"    ERROR: {exc}")
            failed += 1

        print()

    print(f"Done: {passed} passed, {failed} failed.")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
