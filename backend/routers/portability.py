"""
Portability endpoints for Asset Forge projects.

GET  /export/{project_id}  — ZIP entire project folder → FileResponse
POST /import               — Accept .zip, extract to projects dir, validate manifest
"""
import io
import json
import tempfile
import zipfile
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from services.storage_manager import StorageManager, _PROJECTS_DIR

router = APIRouter(prefix="", tags=["portability"])


@router.get("/export/{project_id}")
async def export_project(project_id: str, background_tasks: BackgroundTasks):
    project_dir = _PROJECTS_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    tmp_path = Path(tmp.name)
    tmp.close()

    try:
        with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for file_path in project_dir.rglob("*"):
                if file_path.is_file():
                    arcname = file_path.relative_to(project_dir)
                    zf.write(file_path, arcname)
    except Exception as e:
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Failed to create ZIP: {e}")

    background_tasks.add_task(lambda: tmp_path.unlink(missing_ok=True))

    return FileResponse(
        path=tmp_path,
        media_type="application/zip",
        filename=f"assetforge_{project_id}.zip",
    )


@router.post("/import")
async def import_project(file: UploadFile = File(...)):
    if not (file.filename or "").endswith(".zip"):
        raise HTTPException(status_code=400, detail="File must be a .zip archive")

    zip_bytes = await file.read()

    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid ZIP file")

    names = zf.namelist()
    if "manifest.json" not in names:
        raise HTTPException(status_code=400, detail="ZIP must contain manifest.json at root level")

    try:
        manifest = json.loads(zf.read("manifest.json"))
    except Exception:
        raise HTTPException(status_code=400, detail="manifest.json is not valid JSON")

    project_id = manifest.get("project_id")
    if not project_id or not isinstance(project_id, str):
        raise HTTPException(
            status_code=400,
            detail="manifest.json must have a non-empty 'project_id' string field",
        )

    assets = manifest.get("assets")
    if not isinstance(assets, dict):
        raise HTTPException(
            status_code=400,
            detail="manifest.json must have an 'assets' object field",
        )

    dest = _PROJECTS_DIR / project_id
    dest.mkdir(parents=True, exist_ok=True)

    try:
        zf.extractall(dest)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract ZIP: {e}")
    finally:
        zf.close()

    return {
        "project_id": project_id,
        "asset_count": len(assets),
        "status": "imported",
    }
