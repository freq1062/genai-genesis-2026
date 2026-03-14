import os
from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery = Celery(
    "assetforge",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        "routers.scrape",
        "routers.generate",
        "routers.room",
        "routers.orchestrate",
    ],
)
celery.conf.update(task_track_started=True)
