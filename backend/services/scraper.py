import asyncio
import json
import os
import re

from playwright.async_api import async_playwright
from google import genai
from google.genai import types


async def scrape_product(url: str) -> dict:
    """
    Navigates to a product URL with Playwright, extracts page text/HTML,
    then uses Gemini to parse structured product data.

    Returns:
    {
        "name": str,
        "price_usd": float | None,
        "dimensions_m": [width, depth, height] | None,  # in meters
        "materials": list[str],
        "image_urls": list[str],
        "raw_text": str  # first 3000 chars of page text for MongoDB
    }
    """
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.goto(url, timeout=15000, wait_until="networkidle")

            title = await page.title()
            body_text = await page.inner_text("body")
            body_text = body_text[:4000]

            img_elements = await page.query_selector_all("img")
            image_urls = []
            for img in img_elements:
                src = await img.get_attribute("src")
                if src:
                    image_urls.append(src)

            await browser.close()
    except Exception as e:
        raise RuntimeError(f"Playwright scraping failed for {url}: {e}") from e

    # Parse structured product data with Gemini
    client = genai.Client()

    parse_prompt = f"""Extract product information from the following page text and return ONLY a JSON object with these exact keys:
- "name": product name string
- "price_usd": price as float (null if not found)
- "dimensions_raw": raw dimension string as found on page (e.g. "24.5 x 12 x 30 in"), null if not found
- "materials": list of material strings

Page title: {title}
Page text:
{body_text}

Reply ONLY with the JSON object, no markdown, no explanation."""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=parse_prompt,
        )
        response_text = response.text.strip()
        # Strip markdown code fences if present
        response_text = re.sub(r"^```[a-z]*\n?", "", response_text)
        response_text = re.sub(r"\n?```$", "", response_text)
        parsed = json.loads(response_text)
    except Exception as e:
        raise RuntimeError(f"Gemini product parsing failed: {e}") from e

    dimensions_m = None
    dimensions_raw = parsed.get("dimensions_raw")
    if dimensions_raw:
        convert_prompt = (
            f"Convert this dimension string to [width_m, depth_m, height_m] as a JSON array of floats in meters. "
            f"String: '{dimensions_raw}'. Reply ONLY with the JSON array."
        )
        try:
            dim_response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=convert_prompt,
            )
            dim_text = dim_response.text.strip()
            dim_text = re.sub(r"^```[a-z]*\n?", "", dim_text)
            dim_text = re.sub(r"\n?```$", "", dim_text)
            dimensions_m = json.loads(dim_text)
            if not (isinstance(dimensions_m, list) and len(dimensions_m) == 3):
                dimensions_m = None
        except Exception:
            dimensions_m = None

    return {
        "name": parsed.get("name", title),
        "price_usd": parsed.get("price_usd"),
        "dimensions_m": dimensions_m,
        "materials": parsed.get("materials", []),
        "image_urls": image_urls,
        "raw_text": body_text[:3000],
    }
