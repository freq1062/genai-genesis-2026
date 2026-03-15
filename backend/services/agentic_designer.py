"""Agentic Room Designer — 5-node Railtracks pipeline.

Nodes run sequentially, sharing a mutable PipelineContext.
Each node is responsible for a single stage and must handle its own exceptions gracefully.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
from config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Synthetic price defaults for items that couldn't be scraped
# ---------------------------------------------------------------------------
ITEM_PRICE_DEFAULTS: dict[str, float] = {
    "chair": 45.0, "lamp": 25.0, "table": 80.0, "bookshelf": 60.0,
    "sofa": 150.0, "desk": 90.0, "rug": 35.0, "plant": 15.0,
    "cushion": 12.0, "curtain": 20.0, "mirror": 40.0, "shelf": 30.0,
}
_DEFAULT_ITEM_PRICE = 50.0

_ITEM_DIMENSIONS: dict[str, tuple[float, float, float]] = {
    "chair": (0.55, 0.90, 0.55), "lamp": (0.30, 1.50, 0.30),
    "table": (1.20, 0.75, 0.70), "bookshelf": (0.80, 1.80, 0.30),
    "sofa": (2.00, 0.85, 0.90), "desk": (1.40, 0.76, 0.70),
    "rug": (2.00, 0.01, 1.50), "plant": (0.40, 0.80, 0.40),
    "cushion": (0.45, 0.15, 0.45), "curtain": (1.20, 2.50, 0.05),
    "mirror": (0.60, 1.20, 0.05), "shelf": (0.80, 0.20, 0.25),
}
_DEFAULT_DIMS = (0.50, 0.80, 0.50)


@dataclass
class PipelineContext:
    prompt: str
    budget_usd: float = 0.0
    reconstruction_id: str | None = None
    project_dir: Path = field(default_factory=lambda: Path("/tmp"))
    style_palette: str = ""
    required_items: list[str] = field(default_factory=list)
    sourced_products: list[dict] = field(default_factory=list)
    generated_assets: list[dict] = field(default_factory=list)
    placed_objects: list[dict] = field(default_factory=list)
    manifest: dict = field(default_factory=dict)
    total_cost_usd: float = 0.0


_INTERPRETER_SYSTEM = (
    "You are a room design assistant. Parse the user's interior design request into structured JSON. "
    "Extract required furniture/decor items (generic names only), a style/color palette description, "
    "and the strict numerical maximum budget in USD. Always respond with valid JSON only."
)
_PLANNER_SYSTEM = (
    "You are a spatial layout assistant. Given room dimensions and a list of furniture items with their "
    "sizes, propose [x, y, z] floor-plan coordinates and a y-axis rotation in degrees for each item. "
    "Always respond with valid JSON only."
)


async def _call_llm(system_prompt: str, user_prompt: str, timeout: float = 30.0) -> str:
    if settings.google_api_key:
        return await _call_gemini(system_prompt, user_prompt, timeout)
    return await _call_ollama(system_prompt, user_prompt, timeout)


async def _call_ollama(system_prompt: str, user_prompt: str, timeout: float) -> str:
    payload = {
        "model": settings.ollama_model,
        "prompt": f"{system_prompt}\n\n{user_prompt}",
        "stream": False,
        "format": "json",
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(f"{settings.ollama_url}/api/generate", json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data.get("response", "{}")


async def _call_gemini(system_prompt: str, user_prompt: str, timeout: float) -> str:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-1.5-flash:generateContent?key={settings.google_api_key}"
    )
    payload = {
        "contents": [{"parts": [{"text": f"{system_prompt}\n\n{user_prompt}"}]}],
        "generationConfig": {"responseMimeType": "application/json"},
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]


def _parse_json_response(raw: str) -> Any:
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`").strip()
    return json.loads(cleaned)


class SemanticInterpreterNode:
    async def run(self, ctx: PipelineContext) -> None:
        user_prompt = (
            f'User request: "{ctx.prompt}"\n\n'
            "Return JSON with exactly these keys:\n"
            '{"required_items": ["chair", "lamp", ...], "style_palette": "...", "budget_usd": 100.0}'
        )
        parsed: dict[str, Any] = {}
        try:
            raw = await _call_llm(_INTERPRETER_SYSTEM, user_prompt, timeout=30.0)
            parsed = _parse_json_response(raw)
        except Exception as exc:
            logger.warning("SemanticInterpreterNode: LLM unavailable (%s). Using regex fallback.", exc)
            parsed = self._regex_fallback(ctx.prompt)
        ctx.required_items = [str(i).lower().strip() for i in parsed.get("required_items", [])] or self._extract_words(ctx.prompt)
        ctx.style_palette = str(parsed.get("style_palette", ""))
        if ctx.budget_usd and ctx.budget_usd > 0:
            pass
        else:
            llm_budget = parsed.get("budget_usd")
            if llm_budget and float(llm_budget) > 0:
                ctx.budget_usd = float(llm_budget)
            else:
                ctx.budget_usd = self._extract_budget(ctx.prompt) or 200.0
        logger.info("SemanticInterpreterNode: items=%s, budget=$%.2f", ctx.required_items, ctx.budget_usd)

    def _regex_fallback(self, prompt: str) -> dict[str, Any]:
        budget = self._extract_budget(prompt)
        items = self._extract_words(prompt)
        return {"required_items": items, "style_palette": "", "budget_usd": budget or 200.0}

    @staticmethod
    def _extract_budget(text: str) -> float | None:
        m = re.search(r"\$\s*([\d,]+(?:\.\d{1,2})?)", text)
        if m:
            return float(m.group(1).replace(",", ""))
        m = re.search(r"(\d+(?:\.\d{1,2})?)\s*(?:usd|dollars?)", text, re.IGNORECASE)
        if m:
            return float(m.group(1))
        return None

    @staticmethod
    def _extract_words(prompt: str) -> list[str]:
        known = set(ITEM_PRICE_DEFAULTS.keys())
        words = re.findall(r"[a-z]+", prompt.lower())
        found = [w for w in words if w in known]
        return found if found else ["chair", "lamp"]


class ProductSourcingNode:
    async def run(self, ctx: PipelineContext) -> None:
        try:
            from services.scraper import scrape_product
        except ImportError:
            scrape_product = None
        sourced: list[dict] = []
        running_total = 0.0
        for item in ctx.required_items:
            estimate = ITEM_PRICE_DEFAULTS.get(item, _DEFAULT_ITEM_PRICE)
            if running_total + estimate > ctx.budget_usd:
                logger.info("ProductSourcingNode: skipping %r — would exceed budget", item)
                continue
            product = await self._source_item(item, scrape_product)
            price = product.get("price_usd") or estimate
            if running_total + price > ctx.budget_usd:
                logger.info("ProductSourcingNode: skipping %r — price $%.2f exceeds remaining budget", item, price)
                continue
            running_total += price
            product["price_usd"] = price
            sourced.append(product)
        ctx.sourced_products = sourced
        ctx.total_cost_usd = running_total
        logger.info("ProductSourcingNode: sourced %d products, total $%.2f", len(sourced), running_total)

    async def _source_item(self, item: str, scrape_fn) -> dict:
        if scrape_fn is None:
            return self._synthetic(item)
        search_url = f"https://www.amazon.com/s?k={item.replace(' ', '+')}"
        try:
            scraped = await asyncio.wait_for(scrape_fn(search_url), timeout=30.0)
            # The scraper returns: name, price_usd, dimensions_m, materials, image_urls, raw_text
            dims = _ITEM_DIMENSIONS.get(item, _DEFAULT_DIMS)
            scraped_dims = scraped.get("dimensions_m")
            if isinstance(scraped_dims, list) and len(scraped_dims) == 3:
                dims = tuple(scraped_dims)
            return {
                "title": scraped.get("name") or f"Generic {item.title()}",
                "price_usd": scraped.get("price_usd"),
                "width_m": dims[0], "height_m": dims[1], "length_m": dims[2],
                "image_urls": scraped.get("image_urls", []),
                "image_path": None, "item_type": item,
                "product_url": search_url, "source": "scraped",
            }
        except Exception as exc:
            logger.warning("ProductSourcingNode: scrape failed for %r (%s). Using synthetic.", item, exc)
            return self._synthetic(item)

    @staticmethod
    def _synthetic(item: str) -> dict:
        dims = _ITEM_DIMENSIONS.get(item, _DEFAULT_DIMS)
        return {
            "title": f"Generic {item.title()}",
            "price_usd": ITEM_PRICE_DEFAULTS.get(item, _DEFAULT_ITEM_PRICE),
            "width_m": dims[0], "height_m": dims[1], "length_m": dims[2],
            "image_urls": [], "image_path": None, "item_type": item, "source": "synthetic",
        }


class AssetGenerationNode:
    async def run(self, ctx: PipelineContext) -> None:
        assets: list[dict] = []
        for product in ctx.sourced_products:
            asset = await self._generate_for_product(product, ctx.project_dir)
            assets.append(asset)
        ctx.generated_assets = assets
        logger.info("AssetGenerationNode: generated %d assets", len(assets))

    async def _generate_for_product(self, product: dict, project_dir: Path) -> dict:
        image_path: Path | None = product.get("image_path")
        if image_path is None and product.get("image_urls"):
            image_path = await self._download_image(
                product["image_urls"][0],
                project_dir / f"{product['item_type']}_{uuid.uuid4().hex[:8]}.jpg",
            )
        if image_path is None:
            logger.info("AssetGenerationNode: no image for %r, skipping mesh generation", product.get("title"))
            return {"product": product, "glb_path": None, "job_id": None}
        job_id = str(uuid.uuid4())
        glb_path = await self._dispatch(job_id, image_path, project_dir)
        return {"product": product, "glb_path": glb_path, "job_id": job_id}

    async def _dispatch(self, job_id: str, image_path: Path, project_dir: Path) -> str | None:
        try:
            from services.local_api import generate_and_await
            glb_bytes = await asyncio.to_thread(generate_and_await, str(image_path))
            out_path = project_dir / f"{job_id}.glb"
            out_path.write_bytes(glb_bytes)
            return str(out_path)
        except Exception as exc:
            logger.warning("AssetGenerationNode: local_api generation failed (%s). Skipping.", exc)
            return None

    @staticmethod
    async def _download_image(url: str, dest: Path) -> Path | None:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, follow_redirects=True)
                resp.raise_for_status()
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(resp.content)
                return dest
        except Exception as exc:
            logger.warning("AssetGenerationNode: failed to download image %s (%s)", url, exc)
            return None


class SpatialPlannerNode:
    _DEFAULT_W = 5.0
    _DEFAULT_D = 4.0
    _DEFAULT_H = 2.8

    async def run(self, ctx: PipelineContext) -> None:
        room_w, room_d, room_h = self._room_dimensions(ctx)
        items_desc = self._build_items_description(ctx.generated_assets)
        placements = await self._ask_llm(room_w, room_d, room_h, items_desc, ctx.generated_assets)
        placements = self._apply_gravity(placements)
        placements = self._resolve_collisions(placements, room_w, room_d)
        if ctx.generated_assets and not placements:
            logger.warning("SpatialPlannerNode: placements empty despite assets; using default grid.")
            defaults = self._default_grid(ctx.generated_assets, room_w, room_d)
            placements = []
            for i, asset in enumerate(ctx.generated_assets):
                p = asset["product"]
                lp = defaults[i] if i < len(defaults) else {}
                placements.append({
                    "asset": asset,
                    "position": [float(lp.get("x", 0.0)), float(lp.get("y", 0.0)), float(lp.get("z", 0.0))],
                    "rotation_y": float(lp.get("rotation_y", 0.0)),
                    "dimensions": {
                        "width": float(p.get("width_m", _DEFAULT_DIMS[0])),
                        "height": float(p.get("height_m", _DEFAULT_DIMS[1])),
                        "depth": float(p.get("length_m", _DEFAULT_DIMS[2])),
                    },
                })
        ctx.placed_objects = placements
        logger.info("SpatialPlannerNode: placed %d objects", len(placements))

    def _room_dimensions(self, ctx: PipelineContext) -> tuple[float, float, float]:
        if ctx.reconstruction_id:
            projects_dir = Path(settings.output_dir)
            manifest_path = projects_dir / ctx.reconstruction_id / "manifest.json"
            if manifest_path.exists():
                try:
                    data = json.loads(manifest_path.read_text())
                    dims = data.get("room_geometry") or data.get("room_dimensions", {})
                    return (
                        float(dims.get("width", self._DEFAULT_W)),
                        float(dims.get("depth", self._DEFAULT_D)),
                        float(dims.get("height", self._DEFAULT_H)),
                    )
                except Exception:
                    pass
        return self._DEFAULT_W, self._DEFAULT_D, self._DEFAULT_H

    @staticmethod
    def _build_items_description(assets: list[dict]) -> str:
        lines = []
        for i, asset in enumerate(assets):
            p = asset["product"]
            lines.append(
                f"{i}: {p.get('title', 'item')} "
                f"(w={p.get('width_m', 0.5):.2f}m, "
                f"h={p.get('height_m', 0.8):.2f}m, "
                f"d={p.get('length_m', 0.5):.2f}m)"
            )
        return "\n".join(lines)

    async def _ask_llm(self, room_w, room_d, room_h, items_desc, assets) -> list[dict]:
        user_prompt = (
            f"Room: {room_w}m wide x {room_d}m deep x {room_h}m tall. "
            "Origin at floor centre.\n\n"
            f"Items to place:\n{items_desc}\n\n"
            "Propose [x, y, z] coordinates and y-rotation (degrees) for each item. "
            "Items must not overlap or intersect walls.\n"
            'Return JSON array: [{"item": "chair", "x": 1.0, "y": 0.0, "z": -0.5, "rotation_y": 0}]'
        )
        try:
            raw = await _call_llm(_PLANNER_SYSTEM, user_prompt, timeout=30.0)
            llm_placements: list[dict] = _parse_json_response(raw)
        except Exception as exc:
            logger.warning("SpatialPlannerNode: LLM failed (%s). Using default grid layout.", exc)
            llm_placements = self._default_grid(assets, room_w, room_d)
        if not llm_placements:
            llm_placements = self._default_grid(assets, room_w, room_d)
        result = []
        for i, asset in enumerate(assets):
            p = asset["product"]
            lp = llm_placements[i] if i < len(llm_placements) else {}
            result.append({
                "asset": asset,
                "position": [float(lp.get("x", 0.0)), float(lp.get("y", 0.0)), float(lp.get("z", 0.0))],
                "rotation_y": float(lp.get("rotation_y", 0.0)),
                "dimensions": {
                    "width": float(p.get("width_m", _DEFAULT_DIMS[0])),
                    "height": float(p.get("height_m", _DEFAULT_DIMS[1])),
                    "depth": float(p.get("length_m", _DEFAULT_DIMS[2])),
                },
            })
        return result

    @staticmethod
    def _apply_gravity(placements: list[dict]) -> list[dict]:
        """Force y = height/2 so every object rests on the floor (y=0 is ground plane)."""
        for obj in placements:
            obj["position"][1] = obj["dimensions"]["height"] / 2.0
        return placements

    @staticmethod
    def _resolve_collisions(placements: list[dict], room_w: float, room_d: float) -> list[dict]:
        if not placements:
            return placements
        for obj in placements:
            w = obj["dimensions"]["width"]
            d = obj["dimensions"]["depth"]
            x_min, x_max = -room_w / 2 + w / 2, room_w / 2 - w / 2
            z_min, z_max = -room_d / 2 + d / 2, room_d / 2 - d / 2
            obj["position"][0] = max(x_min, min(x_max, obj["position"][0]))
            obj["position"][2] = max(z_min, min(z_max, obj["position"][2]))
        for i in range(len(placements)):
            for j in range(i + 1, len(placements)):
                a, b = placements[i], placements[j]
                ax, az = a["position"][0], a["position"][2]
                bx, bz = b["position"][0], b["position"][2]
                aw, ad = a["dimensions"]["width"], a["dimensions"]["depth"]
                bw, bd = b["dimensions"]["width"], b["dimensions"]["depth"]
                overlap_x = (aw + bw) / 2 - abs(bx - ax)
                overlap_z = (ad + bd) / 2 - abs(bz - az)
                if overlap_x > 0 and overlap_z > 0:
                    push = overlap_x + 0.05
                    b["position"][0] += push
                    bw2 = b["dimensions"]["width"]
                    b["position"][0] = min(b["position"][0], room_w / 2 - bw2 / 2)
        return placements

    @staticmethod
    def _default_grid(assets: list[dict], room_w: float, room_d: float) -> list[dict]:
        """2×N grid layout radiating from room center."""
        placements = []
        cols = 2
        spacing_x = min(1.5, (room_w - 1.0) / max(cols, 1))
        spacing_z = min(1.5, (room_d - 1.0) / max((len(assets) + 1) // cols, 1))
        for i, _ in enumerate(assets):
            col = i % cols
            row = i // cols
            x = (col - (cols - 1) / 2.0) * spacing_x
            z = (row - (len(assets) - 1) / (2.0 * cols)) * spacing_z
            placements.append({"x": x, "y": 0.0, "z": z, "rotation_y": 0.0})
        return placements


class SceneAssemblerNode:
    @staticmethod
    def apply_budget_gate(products: list[dict], budget_usd: float) -> tuple[list[dict], float]:
        included = []
        total = 0.0
        for p in products:
            price = float(p.get("price_usd") or 0.0)
            if total + price <= budget_usd:
                included.append(p)
                total += price
        return included, total

    async def run(self, ctx: PipelineContext) -> None:
        scene_graph = []
        for idx, obj in enumerate(ctx.placed_objects):
            asset = obj["asset"]
            product = asset["product"]
            scene_graph.append({
                "asset_id": asset.get("job_id") or str(idx),
                "name": product.get("item_type", product.get("title", "")),
                "product_title": product.get("title", ""),
                "product_url": product.get("product_url"),
                "glb_path": asset.get("glb_path"),
                "transform": {
                    "position": obj["position"],
                    "rotation_y_deg": obj["rotation_y"],
                },
                "dimensions_m": obj["dimensions"],
                "price_usd": float(product.get("price_usd") or 0.0),
            })
        manifest = {
            "prompt": ctx.prompt,
            "reconstruction_id": ctx.reconstruction_id,
            "style_palette": ctx.style_palette,
            "budget_usd": ctx.budget_usd,
            "total_cost_usd": ctx.total_cost_usd,
            "scene_graph": scene_graph,
        }
        if not ctx.placed_objects:
            logger.warning("SceneAssemblerNode: no objects were placed — scene is empty.")
            manifest["warning"] = "No objects were placed — scene is empty"
        manifest_path = ctx.project_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2))
        ctx.manifest = manifest
        logger.info("SceneAssemblerNode: manifest written to %s", manifest_path)


async def run_planning_phase(
    prompt: str,
    budget_usd: float | None = None,
    reconstruction_id: str | None = None,
    project_dir: Path | None = None,
) -> PipelineContext:
    """Run SemanticInterpreter + ProductSourcing + SpatialPlanner only (Phase 1)."""
    projects_base = Path(settings.output_dir)
    if project_dir is None:
        if reconstruction_id:
            project_dir = projects_base / reconstruction_id
        else:
            project_dir = projects_base / str(uuid.uuid4())
    project_dir.mkdir(parents=True, exist_ok=True)

    ctx = PipelineContext(
        prompt=prompt,
        reconstruction_id=reconstruction_id,
        project_dir=project_dir,
        budget_usd=budget_usd or 0.0,
    )
    await SemanticInterpreterNode().run(ctx)
    await ProductSourcingNode().run(ctx)
    # Synthesize placeholder assets so SpatialPlannerNode has the expected structure
    ctx.generated_assets = [
        {"product": p, "glb_path": None, "job_id": None}
        for p in ctx.sourced_products
    ]
    await SpatialPlannerNode().run(ctx)
    return ctx


async def run_generation_phase(ctx: PipelineContext) -> None:
    """Run AssetGeneration + SceneAssembler (Phase 2, intended for background execution)."""
    await AssetGenerationNode().run(ctx)
    # Re-link placed_objects to the freshly generated assets (which now have glb_path)
    for i, obj in enumerate(ctx.placed_objects):
        if i < len(ctx.generated_assets):
            obj["asset"] = ctx.generated_assets[i]
    await SceneAssemblerNode().run(ctx)


async def run_agentic_designer(
    prompt: str,
    budget_usd: float | None = None,
    reconstruction_id: str | None = None,
    project_dir: Path | None = None,
) -> PipelineContext:
    projects_base = Path(settings.output_dir)
    if project_dir is None:
        if reconstruction_id:
            project_dir = projects_base / reconstruction_id
        else:
            project_dir = projects_base / str(uuid.uuid4())
    project_dir.mkdir(parents=True, exist_ok=True)

    ctx = PipelineContext(
        prompt=prompt,
        reconstruction_id=reconstruction_id,
        project_dir=project_dir,
        budget_usd=budget_usd or 0.0,
    )
    nodes = [
        SemanticInterpreterNode(),
        ProductSourcingNode(),
        AssetGenerationNode(),
        SpatialPlannerNode(),
        SceneAssemblerNode(),
    ]
    for node in nodes:
        await node.run(ctx)
    return ctx
