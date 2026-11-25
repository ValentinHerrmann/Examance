"""Read-only view of the pinned TeX Live tree for the browser engine, so browser and server compile with identical files (issue #346)."""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.services.texrunner import CONFIG_DIR

# Where backend/latex-texlive/install.sh puts TeX Live in the image; overridable for tests and local installs.
TEXLIVE_ROOT = Path(os.environ.get("TEXLIVE_ROOT", "/opt/texlive"))
_SERVED_DIRS = ("texmf-dist", "texmf-var")
# Documentation, sources and scripts are never read by TeX or xdvipdfmx.
_SKIPPED_PREFIXES = ("texmf-dist/doc/", "texmf-dist/source/", "texmf-dist/scripts/")
_ROOT_FILES = ("texmf.cnf",)
# The runner's own texmf.cnf (read first through TEXMFCNF), so the browser engine wraps logs and limits reads the same way.
EXAMANCE_CNF = "examance/texmf.cnf"


@dataclass(frozen=True)
class TreeManifest:
    """`version` changes with any served file's path or size; `files` maps relative POSIX path to size in bytes."""

    version: str
    files: dict[str, int]


def _served(root: Path, path: Path) -> str | None:
    """The manifest name of a regular file inside the tree, else None (symlinks out of the tree, skipped dirs)."""
    if not path.is_file():
        return None
    try:
        path.resolve().relative_to(root.resolve())
    except ValueError:
        return None
    rel = path.relative_to(root).as_posix()
    return None if rel.startswith(_SKIPPED_PREFIXES) else rel


@lru_cache(maxsize=1)
def tree_manifest() -> TreeManifest | None:
    """The served files of the installed tree, or None when this host has no TeX Live (dev without the image)."""
    root = TEXLIVE_ROOT
    if not (root / "tlpkg" / "texlive.tlpdb").is_file():
        return None
    files: dict[str, int] = {}
    for name in _ROOT_FILES:
        if (root / name).is_file():
            files[name] = (root / name).stat().st_size
    for top in _SERVED_DIRS:
        for dirpath, _dirs, names in os.walk(root / top):
            for name in names:
                rel = _served(root, Path(dirpath) / name)
                if rel is not None:
                    files[rel] = (Path(dirpath) / name).stat().st_size
    files[EXAMANCE_CNF] = (CONFIG_DIR / "texmf.cnf").stat().st_size
    files = dict(sorted(files.items()))
    digest = hashlib.sha256((root / "tlpkg" / "texlive.tlpdb").read_bytes())
    digest.update(json.dumps(files, separators=(",", ":")).encode())
    digest.update((CONFIG_DIR / "texmf.cnf").read_bytes())
    return TreeManifest(version=digest.hexdigest()[:16], files=files)


def resolve_tree_file(relative_path: str) -> Path | None:
    """The file for a manifest entry, else None. Only listed names resolve, so no request string ever becomes a filesystem path."""
    manifest = tree_manifest()
    if manifest is None or relative_path not in manifest.files:
        return None
    if relative_path == EXAMANCE_CNF:
        return CONFIG_DIR / "texmf.cnf"
    return TEXLIVE_ROOT / relative_path
