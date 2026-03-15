"""Minimal settings shim for the backend.

Reads values from environment variables with sensible defaults.
"""

from __future__ import annotations

import os
from pathlib import Path


class _Settings:
    @property
    def google_api_key(self) -> str:
        return os.getenv("GOOGLE_API_KEY", "")

    @property
    def ollama_url(self) -> str:
        return os.getenv("OLLAMA_URL", "http://localhost:11434")

    @property
    def ollama_model(self) -> str:
        return os.getenv("OLLAMA_MODEL", "llama3")

    @property
    def output_dir(self) -> str:
        default = str(Path.home() / "virtual" / "minalex" / "projects")
        return os.getenv("OUTPUT_DIR", default)


settings = _Settings()
