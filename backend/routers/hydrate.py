"""
POST /hydrate/{project_id}/{asset_id}

Re-hydrates a full-resolution GLB from the stored seed receipt, packages it
into a ZIP with the proxy and manifest, streams the ZIP to the caller, then
purges the temp full-res GLB.
"""

import asyncio
import functools
import io
import zipfile

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from services.storage_manager import StorageManager
from services.local_api import verify_model_version, generate_and_await

router = APIRouter(prefix="/hydrate", tags=["hydrate"])


@router.post("/{project_id}/{asset_id}")
async def hydrate_asset(project_id: str, asset_id: str):
    """
    Re-generate a full-resolution GLB from the seed receipt and return a ZIP.

    Steps:
    1. Load manifest — 404 if not found
    2. Verify model version — 409 if seed unstable (hash mismatch)
    3. Regenerate full-res GLB via lab API using stored seed + inference params
    4. Bundle into ZIP: {asset_id}_fullres.glb + proxy.glb + manifest.json
    5. Stream ZIP response, clean up temp GLB

    Returns:
      200 application/zip  — on success
      404                  — project/asset not found
      409                  — seed unstable (model hash mismatch)
      502                  — lab API generation failed
    """
    # 1. Load manifest
    sm = StorageManager(project_id, asset_id)
    try:
        manifest = sm.load_manifest()
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Asset not found: project={project_id} asset={asset_id}",
        )

    # 2. Version guard
    if not verify_model_version(manifest, sm.asset_dir):
        raise HTTPException(
            status_code=409,
            detail=(
                "Seed Unstable: model weight hash mismatch. "
                "The local model has changed since this asset was generated. "
                f"See {sm.validation_report_path} for details."
            ),
        )

    # 3. Re-generate full-res GLB
    inference = manifest.get("inference_parameters", {})
    seed = manifest.get("seed", 1234)

    # Run blocking generation in a thread to avoid blocking the event loop
    try:
        glb_bytes = await asyncio.to_thread(
            functools.partial(
                generate_and_await,
                image_data=b"",           # text-only via caption; no stored image (by design)
                caption=manifest.get("model_version"),
                seed=seed,
                octree_resolution=inference.get("octree_resolution", 256),
                steps=inference.get("steps", 30),
                guidance_scale=inference.get("guidance_scale", 5.0),
                status_callback=lambda msg: print(f"[hydrate] {msg}"),
            )
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=f"3D generation failed: {e}")

    # 4. Build ZIP in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # Full-res GLB
        zf.writestr(f"{asset_id}_fullres.glb", glb_bytes)

        # Proxy GLB (if exists)
        if sm.proxy_path.exists():
            zf.write(sm.proxy_path, "proxy.glb")

        # Manifest
        if sm.manifest_path.exists():
            zf.write(sm.manifest_path, "manifest.json")

        # Validation report if present
        if sm.validation_report_path.exists():
            zf.write(sm.validation_report_path, "validation_report.json")

    zip_buffer.seek(0)
    zip_bytes = zip_buffer.read()

    # 5. Stream and return (full-res GLB was only in memory, nothing to delete from disk)
    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{project_id}_{asset_id}_hydrated.zip"',
            "Content-Length": str(len(zip_bytes)),
        },
    )
