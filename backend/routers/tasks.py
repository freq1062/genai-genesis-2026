from fastapi import APIRouter
from celery_app import celery

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/{task_id}")
async def get_task_status(task_id: str):
    result = celery.AsyncResult(task_id)
    if result.state == "PENDING":
        return {"status": "pending", "task_id": task_id}
    elif result.state == "STARTED":
        return {"status": "running", "task_id": task_id}
    elif result.state == "SUCCESS":
        return {"status": "done", "task_id": task_id, "result": result.result}
    elif result.state == "FAILURE":
        return {"status": "failed", "task_id": task_id, "error": str(result.result)}
    else:
        return {"status": result.state.lower(), "task_id": task_id}
