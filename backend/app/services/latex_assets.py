"""Manifest of the bundled LaTeX assets, served so the browser engine uses the same files."""
from __future__ import annotations

import hashlib
import re
from functools import lru_cache
from pathlib import Path

from app.services.latex import ASSETS_DIR
from app.services.latex_packages import FORBIDDEN_PACKAGES, LOCKED_PACKAGES


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


_REQUIRE_PACKAGE = re.compile(r"\\RequirePackage\s*(?:\[([^\]]*)\]\s*)?\{([^}]*)\}")
_USE_TIKZ_LIBRARY = re.compile(r"\\usetikzlibrary\s*\{([^}]*)\}")
_TEX_COMMENT = re.compile(r"(?<!\\)%.*$", re.MULTILINE)
# Main template files first; the rest are bundled packages the template loads.
_TEMPLATE_ORDER = ("packages", "Schulaufgabe", "Loesung")
# Loaded by every document builder next to Schulaufgabe.sty.
_BUILDER_TIKZ_LIBRARIES = ("shapes.geometric", "arrows")


def _names(argument: str) -> list[str]:
    return [name.strip() for name in argument.split(",") if name.strip()]


def _file_order(path: Path) -> tuple[int, str]:
    return (_TEMPLATE_ORDER.index(path.stem) if path.stem in _TEMPLATE_ORDER else 99, path.stem)


def _read_template_file(
    path: Path,
    packages: dict[str, dict[str, str | None]],
    libraries: dict[str, dict[str, str | None]],
) -> None:
    text = _TEX_COMMENT.sub("", path.read_text(encoding="utf-8", errors="replace"))
    for options, argument in _REQUIRE_PACKAGE.findall(text):
        for name in _names(argument):
            if name.startswith("sty/") or name in FORBIDDEN_PACKAGES:
                continue
            packages.setdefault(
                name,
                {
                    "name": name,
                    "options": " ".join(options.split()),
                    "source": path.stem,
                    "locked": LOCKED_PACKAGES.get(name),
                },
            )
    for argument in _USE_TIKZ_LIBRARY.findall(text):
        for name in _names(argument):
            libraries.setdefault(name, {"name": name, "source": path.stem})


@lru_cache(maxsize=1)
def template_packages() -> dict[str, list[dict[str, str | None]]]:
    """Packages and TikZ libraries the bundled .sty files load, for the settings overview (#108).

    Read from the files themselves so the list cannot drift; pdfLaTeX-only loads are left out."""
    packages: dict[str, dict[str, str | None]] = {}
    libraries: dict[str, dict[str, str | None]] = {
        name: {"name": name, "source": "packages"} for name in _BUILDER_TIKZ_LIBRARIES
    }
    for path in sorted((ASSETS_DIR / "sty").glob("*.sty"), key=_file_order):
        _read_template_file(path, packages, libraries)
    return {"packages": list(packages.values()), "tikz_libraries": list(libraries.values())}
