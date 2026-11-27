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
_CNF = "texmf.cnf"
_ROOT_FILES = (_CNF,)
# The runner's own texmf.cnf (read first through TEXMFCNF), so the browser engine wraps logs and limits reads the same way.
EXAMANCE_CNF = f"examance/{_CNF}"


@dataclass(frozen=True)
class TreeManifest:
    """`version` changes with any served file's path or size; `files` maps relative POSIX path to size in bytes, `paths` the same names to the files on disk."""

    version: str
    files: dict[str, int]
    paths: dict[str, Path]


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
    paths: dict[str, Path] = {}
    for name in _ROOT_FILES:
        if (root / name).is_file():
            paths[name] = root / name
    for top in _SERVED_DIRS:
        for dirpath, _dirs, names in os.walk(root / top):
            for name in names:
                rel = _served(root, Path(dirpath) / name)
                if rel is not None:
                    paths[rel] = Path(dirpath) / name
    paths[EXAMANCE_CNF] = CONFIG_DIR / _CNF
    files = {name: paths[name].stat().st_size for name in sorted(paths)}
    digest = hashlib.sha256((root / "tlpkg" / "texlive.tlpdb").read_bytes())
    digest.update(json.dumps(files, separators=(",", ":")).encode())
    digest.update(paths[EXAMANCE_CNF].read_bytes())
    return TreeManifest(version=digest.hexdigest()[:16], files=files, paths=paths)


def resolve_tree_file(relative_path: str) -> Path | None:
    """The file for a manifest entry, else None. Only listed names resolve, so no request string ever becomes a filesystem path."""
    manifest = tree_manifest()
    return None if manifest is None else manifest.paths.get(relative_path)
