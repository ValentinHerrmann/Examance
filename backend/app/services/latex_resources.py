"""
Validation rules for teacher-uploaded LaTeX resource files.

A resource is any file a teacher attaches to an exercise so the document can
reference it (``\\includegraphics{figure.png}``, ``\\input{data.tex}``, ...).
The rules here are mirrored one-to-one by ``frontend/src/lib/latex/resources.ts``
so a file accepted by the browser is also accepted by the server, and both
engines see the same working directory.

Resources are written *flat* next to ``main.tex`` in the compile working
directory, which is why the name has to be sanitised and why names that would
shadow a bundled asset are refused.
"""
from __future__ import annotations

import re
from pathlib import Path

# Resolved the same way as ``app.services.latex.ASSETS_DIR``; kept independent
# so this module stays importable from the compile service without a cycle.
ASSETS_DIR = Path(__file__).resolve().parents[2] / "latex-assets"
if not ASSETS_DIR.exists():
    ASSETS_DIR = Path("latex-assets")

#: Hard cap for a single file (bytes).
MAX_RESOURCE_BYTES = 5 * 1024 * 1024
#: Hard cap for the sum of one exercise's resources (bytes).
MAX_EXERCISE_RESOURCE_BYTES = 25 * 1024 * 1024
#: Hard cap for the resources inlined into a single compile request (bytes).
MAX_COMPILE_RESOURCE_BYTES = 20 * 1024 * 1024
#: Hard cap for the number of resources inlined into a single compile request.
MAX_COMPILE_RESOURCE_COUNT = 30

MAX_FILENAME_CHARS = 100

# Vector formats stay vector when converted to PDF, and PDF is what LaTeX
# handles reliably. Refusing SVG outright is cheaper than debugging the many
# ways Inkscape/dvisvgm setups fail inside a sandboxed engine.
SVG_REJECTION_MESSAGE = (
    "SVG is not supported because it renders unreliably in LaTeX. "
    "Convert it to PDF first — it stays a vector graphic "
    "(Inkscape: File > Save As > PDF, or `rsvg-convert -f pdf in.svg > out.pdf`)."
)

# MIME types safe to hand back to a browser inline. Everything else is served
# as application/octet-stream: a stored text/html resource returned inline from
# the API origin would be stored XSS.
INLINE_SAFE_MIME_TYPES = frozenset({"image/png", "image/jpeg", "application/pdf"})

_ALLOWED_CHARS = re.compile(r"[^A-Za-z0-9._-]")
_REPEATED_DOTS = re.compile(r"\.{2,}")


class ResourceError(ValueError):
    """Raised when an uploaded resource violates the rules above."""


class ResourceConflictError(ResourceError):
    """Raised when two exercises disagree about what a filename means."""


def _bundled_asset_names() -> set[str]:
    """
    Names a user file must not take, because a bundled asset already owns them
    in the compile working directory.

    ``compile_latex`` copies every top-level entry of ``latex-assets`` into the
    working directory, and the local WASM worker additionally flattens
    ``sty/x.sty`` to ``x.sty`` (compiler.worker.ts). Both spellings are reserved.
    """
    reserved = {"main.tex", "main.log", "main.aux", "main.pdf", "index.json"}
    if ASSETS_DIR.exists():
        for item in ASSETS_DIR.iterdir():
            reserved.add(item.name)
            if item.is_dir():
                for child in item.rglob("*"):
                    if child.is_file():
                        reserved.add(child.name)
    return reserved


def sanitize_resource_name(raw_name: str) -> str:
    """
    Reduce *raw_name* to a flat, LaTeX-friendly filename.

    Directory components are dropped rather than preserved: resources live flat
    in the working directory, so a path here can only be a mistake or an escape
    attempt.
    """
    name = Path(raw_name.strip().replace("\\", "/")).name
    name = _ALLOWED_CHARS.sub("_", name)
    name = _REPEATED_DOTS.sub(".", name).strip("._-")

    if not name:
        raise ResourceError("File name is empty after sanitising.")

    if len(name) > MAX_FILENAME_CHARS:
        stem, dot, ext = name.rpartition(".")
        if dot and len(ext) < 20:
            keep = MAX_FILENAME_CHARS - len(ext) - 1
            name = f"{stem[:keep]}.{ext}"
        else:
            name = name[:MAX_FILENAME_CHARS]

    return name


def validate_resource_name(raw_name: str) -> str:
    """Sanitise *raw_name* and refuse SVG and reserved names. Returns the name."""
    name = sanitize_resource_name(raw_name)

    if name.lower().endswith(".svg"):
        raise ResourceError(SVG_REJECTION_MESSAGE)

    if name in _bundled_asset_names():
        raise ResourceError(
            f"'{name}' is reserved by a bundled LaTeX asset. Please rename the file."
        )

    return name


def validate_resource(raw_name: str, content: bytes) -> str:
    """Validate one resource's name and size. Returns the sanitised name."""
    name = validate_resource_name(raw_name)

    if not content:
        raise ResourceError(f"'{name}' is empty.")
    if len(content) > MAX_RESOURCE_BYTES:
        raise ResourceError(
            f"'{name}' is {len(content) // (1024 * 1024)} MB; the limit is "
            f"{MAX_RESOURCE_BYTES // (1024 * 1024)} MB per file."
        )

    return name


def resolve_content_disposition(mime_type: str | None) -> tuple[str, str]:
    """
    Return ``(media_type, disposition)`` for serving a stored resource.

    Only image/png, image/jpeg and application/pdf are handed back under their
    own type; anything else is downloaded as an opaque blob.
    """
    if mime_type in INLINE_SAFE_MIME_TYPES:
        return mime_type, "inline"
    return "application/octet-stream", "attachment"


def merge_resources(
    per_owner: list[tuple[str, str, bytes]],
) -> dict[str, bytes]:
    """
    Flatten ``(owner_label, filename, content)`` triples into one working-dir map.

    Two exercises may legitimately both own ``figure.png``. Identical bytes are
    written once; differing bytes are a genuine conflict the teacher has to
    resolve by renaming, because the flat filename is the reference used in the
    LaTeX source and rewriting it would be guesswork.
    """
    merged: dict[str, bytes] = {}
    origins: dict[str, str] = {}

    for owner, filename, content in per_owner:
        name = validate_resource(filename, content)
        existing = merged.get(name)
        if existing is None:
            merged[name] = content
            origins[name] = owner
        elif existing != content:
            raise ResourceConflictError(
                f"Two exercises use different files named '{name}' "
                f"({origins[name]} and {owner}). Rename one of them."
            )

    total = sum(len(v) for v in merged.values())
    if total > MAX_COMPILE_RESOURCE_BYTES:
        raise ResourceError(
            f"The exam's resource files total {total // (1024 * 1024)} MB; the limit is "
            f"{MAX_COMPILE_RESOURCE_BYTES // (1024 * 1024)} MB per compilation."
        )

    return merged
