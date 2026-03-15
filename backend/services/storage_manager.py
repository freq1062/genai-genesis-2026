"""
StorageManager: manages the "Seed Receipt" virtual storage model.

Project layout on disk:
  backend/projects/{project_id}/assets/{asset_id}/
    manifest.json         — seed receipt (never deleted)
    proxy.glb             — decimated low-poly mesh (never deleted)
    validation_report.json — written by version guard on mismatch
"""

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

# Base directory for all projects, relative to this file's parent (backend/)
_PROJECTS_DIR = Path(__file__).parent.parent / "projects"


class StorageManager:
    def __init__(self, project_id: str, asset_id: str):
        self.project_id = project_id
        self.asset_id = asset_id
        self.asset_dir = _PROJECTS_DIR / project_id / "assets" / asset_id
        self.asset_dir.mkdir(parents=True, exist_ok=True)

    @property
    def manifest_path(self) -> Path:
        return self.asset_dir / "manifest.json"

    @property
    def proxy_path(self) -> Path:
        return self.asset_dir / "proxy.glb"

    @property
    def validation_report_path(self) -> Path:
        return self.asset_dir / "validation_report.json"

    def save_manifest(
        self,
        input_image_hash: str,
        seed: int,
        model_version: str,
        model_weight_hash: str,
        inference_params: dict,
    ) -> dict:
        """Write manifest.json. Returns the manifest dict."""
        manifest = {
            "input_image_hash": input_image_hash,
            "seed": seed,
            "model_version": model_version,
            "model_weight_hash": model_weight_hash,
            "inference_parameters": inference_params,
            "proxy_path": str(self.proxy_path),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "proxy_ready",
        }
        self.manifest_path.write_text(json.dumps(manifest, indent=2))
        return manifest

    def load_manifest(self) -> dict:
        """Load manifest.json. Raises FileNotFoundError if missing."""
        if not self.manifest_path.exists():
            raise FileNotFoundError(
                f"Manifest not found for project={self.project_id} asset={self.asset_id}"
            )
        return json.loads(self.manifest_path.read_text())

    def save_proxy(self, glb_bytes: bytes) -> Path:
        """
        Decimate the GLB to ~500 faces using trimesh and write proxy.glb.
        Falls back to writing the raw GLB if trimesh decimation fails.
        Returns the proxy path.
        """
        try:
            import io
            import trimesh

            mesh = trimesh.load(io.BytesIO(glb_bytes), file_type="glb", force="mesh")
            current_faces = len(mesh.faces)
            target_faces = 500

            if current_faces > target_faces:
                ratio = target_faces / current_faces
                mesh = mesh.simplify_quadric_decimation(face_count=target_faces)

            # Export back to GLB
            proxy_bytes = mesh.export(file_type="glb")
            if isinstance(proxy_bytes, bytes) and len(proxy_bytes) > 0:
                self.proxy_path.write_bytes(proxy_bytes)
                return self.proxy_path
        except Exception as e:
            print(f"[StorageManager] Trimesh decimation failed ({e}), saving raw GLB as proxy.")

        # Fallback: write raw bytes
        self.proxy_path.write_bytes(glb_bytes)
        return self.proxy_path

    @staticmethod
    def hash_image(image_data: bytes) -> str:
        """Return sha256 hex digest of image bytes, prefixed with 'sha256:'."""
        digest = hashlib.sha256(image_data).hexdigest()
        return f"sha256:{digest}"

    @staticmethod
    def list_assets(project_id: str) -> list[dict]:
        """
        List all assets for a project by scanning the project folder.
        Returns list of { asset_id, manifest_path, has_proxy, has_validation_report }.
        """
        project_dir = _PROJECTS_DIR / project_id / "assets"
        if not project_dir.exists():
            return []
        results = []
        for asset_dir in sorted(project_dir.iterdir()):
            if asset_dir.is_dir():
                results.append({
                    "asset_id": asset_dir.name,
                    "manifest_path": str(asset_dir / "manifest.json"),
                    "has_proxy": (asset_dir / "proxy.glb").exists(),
                    "has_validation_report": (asset_dir / "validation_report.json").exists(),
                })
        return results
