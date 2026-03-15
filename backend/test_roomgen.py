"""
Test: POST /design-room/agentic

Usage:
    python test_roomgen.py [base_url]

Prompts interactively for a design prompt and optional budget, then calls the
agentic room designer pipeline.  Saves the full JSON response and a GLB preview
(one colored box per placed object, sized to its dimensions_m).

Outputs:
    design_{timestamp}.json  — full API response
    design_{timestamp}.glb   — trimesh preview scene (one box per object)
"""

import json
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
OUT_DIR = Path(__file__).parent


def prompt_user() -> tuple[str, float | None]:
    design_prompt = input("Design prompt: ").strip()
    if not design_prompt:
        print("Error: prompt cannot be empty.")
        sys.exit(1)
    budget_str = input("Budget in USD (leave blank for no limit): ").strip()
    budget = float(budget_str) if budget_str else None
    return design_prompt, budget


def post_design(design_prompt: str, budget: float | None) -> dict:
    payload: dict = {"prompt": design_prompt}
    if budget is not None:
        payload["budget_usd"] = str(budget)
    resp = requests.post(
        f"{BASE_URL}/design-room/agentic",
        data=payload,
        timeout=300,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"HTTP {resp.status_code}: {resp.text}")
    return resp.json()


def poll_until_done(result: dict, poll_interval: int = 5, max_wait: int = 600) -> dict:
    """If the response has a poll_url, keep GETting it until scene_graph is non-empty."""
    poll_url = result.get("poll_url")
    if not poll_url:
        return result
    # If scene_graph is already populated (unlikely on first response), skip polling.
    if result.get("scene_graph"):
        return result

    print(f"  Polling {poll_url} for generation results", end="", flush=True)
    deadline = time.monotonic() + max_wait
    while time.monotonic() < deadline:
        time.sleep(poll_interval)
        print(".", end="", flush=True)
        try:
            resp = requests.get(f"{BASE_URL}{poll_url}", timeout=30)
        except requests.RequestException:
            continue
        if resp.status_code == 404:
            # project not indexed yet — keep waiting
            continue
        if resp.status_code != 200:
            print(f"\n  Poll returned HTTP {resp.status_code}; stopping.")
            break
        data = resp.json()
        if data.get("scene_graph") or data.get("status") not in ("queued", "generating", "planning_complete", None):
            print()  # newline after dots
            return data
    print("\n  [timeout] Generation did not complete in time; using planning results.")
    return result


def save_json(data: dict, out: Path) -> None:
    out.write_text(json.dumps(data, indent=2))
    print(f"  JSON → {out}")


def save_glb(scene_graph: list[dict], out: Path) -> None:
    try:
        import numpy as np
        import trimesh
    except ImportError:
        print("  [skip] trimesh/numpy not installed — skipping GLB export")
        return

    if not scene_graph:
        print("  [skip] No objects to export — skipping GLB.")
        return

    scene = trimesh.Scene()
    rng = np.random.default_rng(42)

    for i, obj in enumerate(scene_graph):
        transform = obj.get("transform", {})
        pos = transform.get("position") or [0.0, 0.0, 0.0]
        if isinstance(pos, dict):
            pos = [pos.get("x", 0.0), pos.get("y", 0.0), pos.get("z", 0.0)]
        dims = obj.get("dimensions_m") or [0.5, 0.8, 0.5]
        name = obj.get("name") or f"object_{i}"

        # dims may be a list [w,h,d] or a dict with width_m/height_m/depth_m keys
        if isinstance(dims, dict):
            dims = [
                float(dims.get("width_m") or dims.get("x") or 0.5),
                float(dims.get("height_m") or dims.get("y") or 0.8),
                float(dims.get("depth_m") or dims.get("length_m") or dims.get("z") or 0.5),
            ]
        else:
            dims = [float(v) for v in dims]
        box = trimesh.creation.box(extents=dims)
        # random pastel colour per object
        color = [*rng.integers(120, 230, size=3).tolist(), 200]
        box.visual.face_colors = color

        # Place bottom of box at floor level
        mat = np.eye(4)
        mat[0, 3] = float(pos[0])
        mat[1, 3] = float(pos[1]) + float(dims[1]) / 2.0
        mat[2, 3] = float(pos[2])
        scene.add_geometry(box, node_name=name, transform=mat)

    glb_bytes = scene.export(file_type="glb")
    out.write_bytes(glb_bytes)
    print(f"  GLB  → {out}  ({len(glb_bytes):,} bytes, {len(scene_graph)} object(s))")


def main() -> None:
    design_prompt, budget = prompt_user()

    print(f"\nPOST {BASE_URL}/design-room/agentic …")
    try:
        result = post_design(design_prompt, budget)
    except RuntimeError as exc:
        print(f"Error: {exc}")
        sys.exit(1)

    # ── Poll until generation is complete ────────────────────────────────────
    result = poll_until_done(result)

    # ── Summary ──────────────────────────────────────────────────────────────
    print("\n--- Result ---")
    print(f"  project_id    : {result.get('project_id') or result.get('design_id')}")
    print(f"  style_palette : {result.get('style_palette')}")
    print(f"  budget_usd    : ${result.get('budget_usd') or 0:.2f}")
    print(f"  total_cost_usd: ${result.get('total_cost_usd') or 0:.2f}")
    scene_graph: list[dict] = result.get("scene_graph") or []

    # Fall back to placements (planning-phase data) if generation isn't done yet.
    # Placements have {name, item_type, x, y, z, rotation_y} — convert to scene_graph shape.
    if not scene_graph:
        for p in result.get("placements") or []:
            scene_graph.append({
                "name": p.get("name") or p.get("item_type", ""),
                "price_usd": 0.0,
                "transform": {"position": [p.get("x", 0), p.get("y", 0), p.get("z", 0)]},
                "dimensions_m": [0.5, 0.8, 0.5],
            })
        if scene_graph:
            print("  [note] Using planning-phase placements (3D assets still generating)")

    print(f"  objects placed: {len(scene_graph)}")
    for obj in scene_graph:
        pos = (obj.get("transform") or {}).get("position", [])
        print(f"    • {(obj.get('name') or ''):<30s}  pos={pos}  ${obj.get('price_usd') or 0:.2f}")

    # ── Save outputs ─────────────────────────────────────────────────────────
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    print(f"\nSaving outputs (timestamp={ts}) …")
    save_json(result, OUT_DIR / f"design_{ts}.json")
    save_glb(scene_graph, OUT_DIR / f"design_{ts}.glb")

    print("\nDone.")


if __name__ == "__main__":
    main()
