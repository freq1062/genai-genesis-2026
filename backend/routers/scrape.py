from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/scrape-product", tags=["scrape"])


class ScrapeRequest(BaseModel):
    url: str


@router.post("")
async def scrape_product_endpoint(request: ScrapeRequest):
    """Scrape a product URL synchronously and return structured data."""
    import asyncio
    from services.scraper import scrape_product

    try:
        result = await scrape_product(request.url)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Scrape failed: {e}")

    return result
