"""Manifest of the bundled LaTeX assets, served so the browser engine uses the same files."""
from __future__ import annotations

import hashlib
from functools import lru_cache
from pathlib import Path

from app.services.latex import ASSETS_DIR


@lru_cache(maxsize=1)
def asset_manifest() -> dict[str, str]:
    """Relative POSIX path -> SHA-256 of every served asset (`main.*` leftovers are skipped)."""
    manifest: dict[str, str] = {}
    for path in sorted(ASSETS_DIR.rglob("*")):
        if not path.is_file() or path.name.startswith("main."):
            continue
        manifest[path.relative_to(ASSETS_DIR).as_posix()] = hashlib.sha256(
            path.read_bytes()
        ).hexdigest()
    return manifest


def resolve_asset(relative_path: str) -> Path | None:
    """The file for a manifest entry, else None. Only listed names resolve, so no request
    string ever becomes a filesystem path (traversal, absolute paths, unlisted files)."""
    if relative_path not in asset_manifest():
        return None
    return ASSETS_DIR / relative_path
