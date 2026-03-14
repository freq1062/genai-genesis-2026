from fastapi import APIRouter

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/{task_id}")
async def get_task_status(task_id: str):
    """Celery task polling is no longer supported (portable-first architecture)."""
    return {"task_id": task_id, "status": "gone", "detail": "Async task polling removed. All endpoints are now synchronous."}
