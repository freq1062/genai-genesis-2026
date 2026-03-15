from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from config import settings
from services.agentic_designer import PipelineContext, run_generation_phase, run_planning_phase

router = APIRouter(prefix="/design-room", tags=["designer"])


class AgenticDesignRequest(BaseModel):
    prompt: str
    reconstruction_id: str | None = None
    budget_usd: float | None = None


@router.post("/agentic", response_model=None)
async def agentic_design_room(
    req: AgenticDesignRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    """Phase 1: run planning synchronously and return immediately.
    Phase 2: run 3D asset generation + scene assembly in the background."""
    try:
        ctx = await run_planning_phase(
            prompt=req.prompt,
            budget_usd=req.budget_usd,
            reconstruction_id=req.reconstruction_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Planning phase failed: {exc}") from exc

    sourced = [
        {
            "name": p.get("title", ""),
            "price_usd": p.get("price_usd", 0),
            "item_type": p.get("item_type", ""),
        }
        for p in ctx.sourced_products
    ]
    placements = [
        {
            "name": obj["asset"]["product"].get("title", ""),
            "item_type": obj["asset"]["product"].get("item_type", ""),
            "x": obj["position"][0],
            "y": obj["position"][1],
            "z": obj["position"][2],
            "rotation_y": obj["rotation_y"],
        }
        for obj in ctx.placed_objects
    ]

    initial_manifest = {
        "prompt": ctx.prompt,
        "reconstruction_id": ctx.reconstruction_id,
        "style_palette": ctx.style_palette,
        "budget_usd": ctx.budget_usd,
        "total_cost_usd": ctx.total_cost_usd,
        "status": "planning_complete",
        "sourced_products": sourced,
        "placements": placements,
        "scene_graph": [],
    }
    manifest_path = ctx.project_dir / "manifest.json"
    manifest_path.write_text(json.dumps(initial_manifest, indent=2))
    ctx.manifest = initial_manifest

    background_tasks.add_task(run_generation_phase, ctx)

    project_id = ctx.reconstruction_id or ctx.project_dir.name
    return {
        "project_id": project_id,
        "status": "planning_complete",
        "style_palette": ctx.style_palette,
        "budget_usd": ctx.budget_usd,
        "total_cost_usd": ctx.total_cost_usd,
        "sourced_products": sourced,
        "placements": placements,
        "scene_graph": [],
        "poll_url": f"/design-room/agentic/{project_id}",
        "manifest_path": str(manifest_path),
    }


@router.get("/agentic/{project_id}", response_model=None)
async def get_agentic_design_status(project_id: str) -> dict:
    """Poll for the completed scene graph after generation finishes."""
    manifest_path = Path(settings.output_dir) / project_id / "manifest.json"
    if not manifest_path.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    data = json.loads(manifest_path.read_text())
    scene_graph = data.get("scene_graph", [])
    status = "complete" if scene_graph else data.get("status", "generating")
    return {**data, "project_id": project_id, "status": status}
