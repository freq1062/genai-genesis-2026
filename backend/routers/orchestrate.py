import asyncio
import json
import os
import urllib.parse
import uuid

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/design-room", tags=["orchestrate"])


class DesignRoomRequest(BaseModel):
    scene_id: str
    prompt: str


@router.post("")
async def design_room_endpoint(request: DesignRoomRequest):
    """
    Agentic orchestrator: takes a scene_id + natural language prompt,
    scrapes products, generates 3D assets, places them in the room.
    Returns the scene graph JSON directly.
    """
    return await asyncio.to_thread(_design_room_sync, request.scene_id, request.prompt)


def _make_search_url(item: str, style: str, budget: float | None) -> str:
    query = f"{style} {item}"
    if budget:
        query += f" under ${int(budget)}"
    return f"https://www.google.com/search?q={urllib.parse.quote(query)}+buy&tbm=shop"


def _design_room_sync(scene_id: str, prompt: str) -> dict:
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
    from services.local_api import generate_and_await, get_model_weight_hash
    from services.storage_manager import StorageManager

    asset_records = []
    for product in products:
        asset_project_id = str(uuid.uuid4())
        asset_id = str(uuid.uuid4())
        glb_bytes = None
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

            glb_bytes = generate_and_await(
                image_bytes,
                caption=product.get("name") or product.get("item_type"),
                seed=1234,
                octree_resolution=128,
                steps=30,
                guidance_scale=5.0,
                status_callback=lambda msg: print(f"[design_room] {msg}"),
            )

            sm = StorageManager(asset_project_id)
            import hashlib
            sm.save_asset_manifest(
                asset_id=asset_id,
                input_image_hash=hashlib.sha256(image_bytes).hexdigest() if image_bytes else "none",
                seed=1234,
                model_version=os.getenv("LOCAL_MODEL_VERSION", "hunyuan3d-v2.1"),
                model_weight_hash=get_model_weight_hash(),
                inference_params={"octree_resolution": 128, "steps": 30, "guidance_scale": 5.0},
            )
            if image_bytes:
                sm.save_image(asset_id, image_bytes)
            sm.save_proxy(asset_id, glb_bytes)
        except Exception as gen_err:
            print(f"[design_room] GLB generation failed for {product.get('name')}: {gen_err}")

        asset_records.append((asset_id, glb_bytes, product, product.get("item_type", "unknown")))

    # ── Step 5: Load room dimensions from StorageManager ────────────────────
    room = {"width_m": 4.0, "depth_m": 4.0, "height_m": 2.7}
    try:
        sm_room = StorageManager(scene_id)
        loaded_dims = sm_room.get_room_dimensions()
        if loaded_dims:
            room = loaded_dims
    except Exception as db_err:
        print(f"[design_room] Room dimensions lookup failed (using default): {db_err}")

    # ── Step 6: Place assets in room ─────────────────────────────────────────
    from services.placement import place_assets

    asset_list = [
        {
            "asset_id": asset_id,
            "glb_path": None,
            "dimensions_m": product.get("dimensions_m"),
            "caption": product.get("name") or item_type,
            "product_url": product.get("product_url"),
            "type": item_type,
        }
        for asset_id, glb_bytes, product, item_type in asset_records
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
