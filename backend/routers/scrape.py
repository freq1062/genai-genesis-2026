from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from celery_app import celery
import os

router = APIRouter(prefix="/scrape-product", tags=["scrape"])


class ScrapeRequest(BaseModel):
    url: str  # Use str not HttpUrl for flexibility


@router.post("")
async def scrape_product_endpoint(request: ScrapeRequest):
    """Queue a product scraping task. Returns task_id to poll."""
    task = scrape_task.delay(request.url)
    return {"task_id": task.id, "status": "pending"}


@celery.task(name="scrape_product_task", bind=True)
def scrape_task(self, url: str):
    """Celery task: scrape product, store in MongoDB, return structured data."""
    import asyncio
    from services.scraper import scrape_product

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(scrape_product(url))
    finally:
        loop.close()

    # Store result in MongoDB using sync pymongo (Motor requires an event loop)
    try:
        from pymongo import MongoClient
        mongo_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
        mongo_db = os.getenv("MONGODB_DB", "assetforge")
        sync_client = MongoClient(mongo_url, serverSelectionTimeoutMS=3000)
        try:
            inserted = sync_client[mongo_db]["products"].insert_one({
                "url": url,
                **result
            })
            result["mongo_id"] = str(inserted.inserted_id)
        finally:
            sync_client.close()
    except Exception as e:
        print(f"MongoDB storage failed (non-fatal): {e}")
        result["mongo_id"] = None

    return result
