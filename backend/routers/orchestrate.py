import asyncio
import json
import os
import urllib.parse
import uuid

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from celery_app import celery

router = APIRouter(prefix="/design-room", tags=["orchestrate"])


class DesignRoomRequest(BaseModel):
    scene_id: str
    prompt: str


@router.post("")
async def design_room_endpoint(request: DesignRoomRequest):
    """
    Agentic orchestrator: takes a scene_id + natural language prompt,
    scrapes products, generates 3D assets, places them in the room.
    Returns task_id to poll.
    """
    task = design_room_task.delay(request.scene_id, request.prompt)
    return {"task_id": task.id, "status": "pending"}


def _make_search_url(item: str, style: str, budget: float | None) -> str:
    query = f"{style} {item}"
    if budget:
        query += f" under ${int(budget)}"
    return f"https://www.google.com/search?q={urllib.parse.quote(query)}+buy&tbm=shop"


@celery.task(name="design_room_task", bind=True)
def design_room_task(self, scene_id: str, prompt: str):
    # ── Step 1: Parse prompt with Gemini ────────────────────────────────────
    parsed_intent = {"budget_usd": 500, "style": "Modern", "items": ["sofa", "chair", "table"], "per_item_budget_usd": None}
    try:
        from google import genai as google_genai
        client = google_genai.Client()
        parse_prompt = (
            "Parse this room design request and return a JSON object with these exact keys:\n"
            "- budget_usd: total budget as a float (null if not mentioned)\n"
            "- style: interior design style as a string (e.g. 'Scandinavian', 'Industrial', 'Modern')\n"
            "- items: list of furniture/product types to find (e.g. ['sofa', 'coffee table', 'floor lamp'])\n"
            "- per_item_budget_usd: budget divided equally per item as a float\n\n"
            f"Request: '{prompt}'\n\nReply ONLY with valid JSON."
        )
        response = client.models.generate_content(model="gemini-2.5-flash", contents=parse_prompt)
        raw = response.text.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed_intent = json.loads(raw.strip())
    except Exception as e:
        print(f"[design_room] Step 1 (Gemini parse) failed: {e}")

    style = parsed_intent.get("style") or "Modern"
    items = parsed_intent.get("items") or ["sofa", "chair", "table"]
    per_item_budget = parsed_intent.get("per_item_budget_usd") or parsed_intent.get("budget_usd")

    # ── Step 2: Build search URLs ────────────────────────────────────────────
    search_urls = [_make_search_url(item, style, per_item_budget) for item in items]

    # ── Step 3: Scrape products in parallel ──────────────────────────────────
    from services.scraper import scrape_product

    async def scrape_all(urls):
        tasks = [scrape_product(url) for url in urls]
        return await asyncio.gather(*tasks, return_exceptions=True)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        scrape_results = loop.run_until_complete(scrape_all(search_urls))
    finally:
        loop.close()

    products = []
    for i, result in enumerate(scrape_results):
        if isinstance(result, Exception):
            print(f"[design_room] Scrape failed for {items[i]}: {result}")
            products.append({
                "name": items[i],
                "dimensions_m": None,
                "image_urls": [],
                "product_url": search_urls[i],
                "item_type": items[i],
            })
        else:
            result["item_type"] = items[i]
            if not result.get("image_urls"):
                result["image_urls"] = []
            products.append(result)

    # ── Step 4: Generate 3D assets ───────────────────────────────────────────
    from services.hunyuan import generate_glb_shape_only

    glb_dir = os.path.join(os.path.dirname(__file__), "..", "generated_assets")
    os.makedirs(glb_dir, exist_ok=True)

    asset_records = []  # list of (asset_id, glb_path | None, product, item_type)
    for product in products:
        asset_id = str(uuid.uuid4())
        glb_path = None
        try:
            image_bytes = b""
            image_urls = product.get("image_urls") or []
            if image_urls:
                try:
                    resp = httpx.get(image_urls[0], timeout=10, follow_redirects=True)
                    if resp.status_code == 200:
                        image_bytes = resp.content
                except Exception as img_err:
                    print(f"[design_room] Image download failed: {img_err}")

            glb_bytes = generate_glb_shape_only(
                image_bytes,
                caption=product.get("name") or product.get("item_type"),
                dimensions_m=product.get("dimensions_m"),
            )
            glb_path = os.path.join(glb_dir, f"{asset_id}.glb")
            with open(glb_path, "wb") as f:
                f.write(glb_bytes)
        except Exception as gen_err:
            print(f"[design_room] GLB generation failed for {product.get('name')}: {gen_err}")

        asset_records.append((asset_id, glb_path, product, product.get("item_type", "unknown")))

    # ── Step 5: Load room dimensions from PostgreSQL ─────────────────────────
    room = {"width_m": 4.0, "depth_m": 4.0, "height_m": 2.7}
    try:
        from sqlalchemy import create_engine
        from sqlalchemy.orm import Session
        from db.postgres import Scene

        raw_url = os.getenv("POSTGRES_URL", "postgresql+asyncpg://postgres:postgres@localhost/assetforge")
        sync_url = raw_url.replace("postgresql+asyncpg://", "postgresql://")
        engine = create_engine(sync_url)
        with Session(engine) as session:
            scene = session.get(Scene, scene_id)
            if scene and scene.dimensions_json:
                room = scene.dimensions_json
        engine.dispose()
    except Exception as db_err:
        print(f"[design_room] DB lookup failed (using default room): {db_err}")

    # ── Step 6: Place assets in room ─────────────────────────────────────────
    from services.placement import place_assets

    asset_list = [
        {
            "asset_id": asset_id,
            "glb_path": glb_path,
            "dimensions_m": product.get("dimensions_m"),
            "caption": product.get("name") or item_type,
            "product_url": product.get("product_url"),
            "type": item_type,
        }
        for asset_id, glb_path, product, item_type in asset_records
    ]

    try:
        placed = place_assets(room, asset_list)
    except Exception as place_err:
        print(f"[design_room] Placement failed: {place_err}")
        placed = []

    # ── Step 7: Return complete scene graph ───────────────────────────────────
    return {
        "version": 1,
        "scene_id": scene_id,
        "prompt": prompt,
        "room": {
            "width_m": room.get("width_m"),
            "depth_m": room.get("depth_m"),
            "height_m": room.get("height_m"),
        },
        "objects": placed,
        "budget_summary": {
            "total_budget_usd": parsed_intent.get("budget_usd"),
            "items_found": len(placed),
            "style": parsed_intent.get("style"),
        },
    }
