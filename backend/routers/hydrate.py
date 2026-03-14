"""
POST /hydrate/{project_id}/{asset_id}

Re-hydrates a full-resolution GLB from the project manifest seed receipt,
verifies the seed is still stable, packages a ZIP, and streams it to the caller.
"""

import asyncio
import io
import zipfile

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from services.storage_manager import StorageManager
from services.local_api import verify_model_version, generate_and_await

router = APIRouter(prefix="/hydrate", tags=["hydrate"])


@router.post("/{project_id}/{asset_id}")
async def hydrate_asset(project_id: str, asset_id: str):
    sm = StorageManager(project_id)

    # 1. Load project manifest
    try:
        manifest = sm.load_project_manifest()
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    # 2. Seed receipt check
    assets = manifest.get("assets", {})
    if asset_id not in assets:
        raise HTTPException(
            status_code=404,
            detail=f"Seed receipt not found for asset {asset_id} in project {project_id}",
        )

    asset_entry = assets[asset_id]
    inference = asset_entry.get("inference_parameters", {})
    seed = asset_entry.get("seed", 1234)

    # 3. Model version guard
    if not verify_model_version(asset_entry, sm.asset_dir(asset_id)):
        raise HTTPException(
            status_code=409,
            detail=(
                "Seed Unstable: model weight hash mismatch. "
                "The local model has changed since this asset was generated. "
                f"See validation_report.json in project {project_id} asset {asset_id}."
            ),
        )

    # 4. Re-generate full-res GLB
    try:
        glb_bytes = await asyncio.to_thread(
            generate_and_await,
            b"",                                          # image_data (text-only replay)
            asset_entry.get("model_version"),             # caption
            seed,
            inference.get("octree_resolution", 256),
            inference.get("steps", 30),
            inference.get("guidance_scale", 5.0),
            lambda msg: print(f"[hydrate] {msg}"),
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=f"3D generation failed: {e}")

    # 5. Update status
    try:
        sm.update_asset_status(asset_id, "hydrated")
    except Exception as e:
        print(f"[hydrate] Status update failed (non-fatal): {e}")

    # 6. Bundle ZIP
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{asset_id}_fullres.glb", glb_bytes)
        proxy = sm.proxy_path(asset_id)
        if proxy.exists():
            zf.write(proxy, "proxy.glb")
        if sm.manifest_path.exists():
            zf.write(sm.manifest_path, "manifest.json")
        vr = sm.validation_report_path(asset_id)
        if vr.exists():
            zf.write(vr, "validation_report.json")

    zip_buffer.seek(0)
    zip_bytes = zip_buffer.read()

    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{project_id}_{asset_id}_hydrated.zip"',
            "Content-Length": str(len(zip_bytes)),
        },
    )
