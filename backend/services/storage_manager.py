"""
StorageManager: Portable-First asset storage for Asset Forge.

Project layout on disk:
  {PROJECTS_DIR}/{project_id}/
    manifest.json               — project-level manifest (all assets + room dims)
    assets/{asset_id}/
      proxy.glb                 — decimated low-poly mesh (never deleted)
      {asset_id}_original.png   — input image saved alongside proxy
      validation_report.json    — written by version guard on hash mismatch

PROJECTS_DIR is read from env var ASSET_FORGE_PROJECTS_DIR;
defaults to ~/virtual/minalex/projects (mirrors /virtual/minalex/projects intent).
"""

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

_PROJECTS_DIR = Path(
    os.environ.get(
        "ASSET_FORGE_PROJECTS_DIR",
        Path.home() / "virtual" / "minalex" / "projects",
    )
)


class StorageManager:
    def __init__(self, project_id: str):
        self.project_id = project_id
        self.project_dir = _PROJECTS_DIR / project_id
        self.project_dir.mkdir(parents=True, exist_ok=True)

    # ── Path helpers ─────────────────────────────────────────────────────────

    @property
    def manifest_path(self) -> Path:
        return self.project_dir / "manifest.json"

    def asset_dir(self, asset_id: str) -> Path:
        d = self.project_dir / "assets" / asset_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def proxy_path(self, asset_id: str) -> Path:
        return self.asset_dir(asset_id) / "proxy.glb"

    def image_path(self, asset_id: str) -> Path:
        return self.asset_dir(asset_id) / f"{asset_id}_original.png"

    def validation_report_path(self, asset_id: str) -> Path:
        return self.asset_dir(asset_id) / "validation_report.json"

    # ── Internal manifest I/O ────────────────────────────────────────────────

    def _load_raw_manifest(self) -> dict:
        """Load project manifest or return fresh template. Does NOT write to disk."""
        if not self.manifest_path.exists():
            now = datetime.now(timezone.utc).isoformat()
            return {
                "project_id": self.project_id,
                "created_at": now,
                "updated_at": now,
                "room_dimensions": None,
                "assets": {},
            }
        return json.loads(self.manifest_path.read_text())

    def _save_raw_manifest(self, data: dict) -> None:
        """Stamp updated_at, write to disk, and log."""
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        self.manifest_path.write_text(json.dumps(data, indent=2))
        self._rt_log("manifest_saved", {"project_id": self.project_id})

    # ── Public manifest API ──────────────────────────────────────────────────

    def load_project_manifest(self) -> dict:
        """Return full project manifest. Raises FileNotFoundError if project doesn't exist."""
        if not self.manifest_path.exists():
            raise FileNotFoundError(f"Project not found: {self.project_id}")
        data = json.loads(self.manifest_path.read_text())
        self._rt_log(
            "manifest_loaded",
            {"project_id": self.project_id, "asset_count": len(data.get("assets", {}))},
        )
        return data

    def save_asset_manifest(
        self,
        asset_id: str,
        input_image_hash: str,
        seed: int,
        model_version: str,
        model_weight_hash: str,
        inference_params: dict,
    ) -> dict:
        """Upsert asset entry in the project manifest. Returns the asset entry dict."""
        data = self._load_raw_manifest()
        entry = {
            "seed": seed,
            "model_version": model_version,
            "model_weight_hash": model_weight_hash,
            "inference_parameters": inference_params,
            "input_image_hash": input_image_hash,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "proxy_ready",
        }
        data["assets"][asset_id] = entry
        self._save_raw_manifest(data)
        self._rt_log("asset_manifest_saved", {"asset_id": asset_id, "seed": seed})
        return entry

    def load_asset_manifest(self, asset_id: str) -> dict:
        """
        Return asset entry from project manifest.
        Raises FileNotFoundError if project not found, KeyError if asset not found.
        """
        data = self.load_project_manifest()
        if asset_id not in data.get("assets", {}):
            raise KeyError(f"Asset {asset_id} not found in project {self.project_id}")
        entry = data["assets"][asset_id]
        self._rt_log("asset_manifest_loaded", {"asset_id": asset_id})
        return entry

    def update_asset_status(self, asset_id: str, status: str) -> None:
        """Update the status field of an existing asset entry."""
        data = self._load_raw_manifest()
        if asset_id not in data.get("assets", {}):
            raise KeyError(f"Asset {asset_id} not found in project {self.project_id}")
        data["assets"][asset_id]["status"] = status
        self._save_raw_manifest(data)
        self._rt_log("asset_status_updated", {"asset_id": asset_id, "status": status})

    # ── Room dimensions ──────────────────────────────────────────────────────

    def set_room_dimensions(self, dims: dict) -> None:
        """Set room_dimensions in the project manifest."""
        data = self._load_raw_manifest()
        data["room_dimensions"] = dims
        self._save_raw_manifest(data)
        self._rt_log("room_dimensions_saved", dims)

    def get_room_dimensions(self) -> dict | None:
        """Return room_dimensions from manifest, or None if not set."""
        if not self.manifest_path.exists():
            return None
        data = json.loads(self.manifest_path.read_text())
        return data.get("room_dimensions")

    # ── File I/O ─────────────────────────────────────────────────────────────

    def save_proxy(self, asset_id: str, glb_bytes: bytes) -> Path:
        """
        Decimate GLB to ≤500 faces using trimesh, write to assets/{asset_id}/proxy.glb.
        Falls back to raw bytes on error. Returns proxy path.
        """
        path = self.proxy_path(asset_id)
        try:
            import io
            import trimesh

            mesh = trimesh.load(io.BytesIO(glb_bytes), file_type="glb", force="mesh")
            if len(mesh.faces) > 500:
                mesh = mesh.simplify_quadric_decimation(face_count=500)
            proxy_bytes = mesh.export(file_type="glb")
            if isinstance(proxy_bytes, bytes) and len(proxy_bytes) > 0:
                path.write_bytes(proxy_bytes)
                return path
        except Exception as e:
            print(f"[StorageManager] Trimesh decimation failed ({e}), saving raw GLB as proxy.")
        path.write_bytes(glb_bytes)
        return path

    def save_image(self, asset_id: str, image_bytes: bytes) -> Path:
        """Write image bytes to assets/{asset_id}/{asset_id}_original.png. Returns image path."""
        path = self.image_path(asset_id)
        path.write_bytes(image_bytes)
        self._rt_log("image_saved", {"asset_id": asset_id, "bytes": len(image_bytes)})
        return path

    # ── Static utilities ─────────────────────────────────────────────────────

    @staticmethod
    def hash_image(image_data: bytes) -> str:
        """Return sha256 hex digest of image bytes, prefixed with 'sha256:'."""
        return f"sha256:{hashlib.sha256(image_data).hexdigest()}"

    @staticmethod
    def list_assets(project_id: str) -> list[dict]:
        """
        Scan project folder and return list of {asset_id, has_proxy, has_image} dicts.
        """
        assets_dir = _PROJECTS_DIR / project_id / "assets"
        if not assets_dir.exists():
            return []
        results = []
        for asset_dir in sorted(assets_dir.iterdir()):
            if asset_dir.is_dir():
                asset_id = asset_dir.name
                results.append({
                    "asset_id": asset_id,
                    "has_proxy": (asset_dir / "proxy.glb").exists(),
                    "has_image": (asset_dir / f"{asset_id}_original.png").exists(),
                })
        return results

    # ── Logging ──────────────────────────────────────────────────────────────

    def _rt_log(self, event: str, data: dict) -> None:
        """Log a storage event via print (railtracks captures stdout)."""
        print(f"[StorageManager] {event}: {json.dumps(data)}")
