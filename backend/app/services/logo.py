"""
Exam header logos (issue #46): validation and resolution.

Every account prints the bundled default logo (MTG) until it stores its own logo or chooses none;
an exam either uses the account's choice, prints none, or carries its own.
The logo reaches the compile working directory under a fixed name
(``examance-logo.<ext>``, :data:`LOGO_FILENAMES`). ``Schulaufgabe.sty`` prints whichever of
those files exists, so the LaTeX source never names the logo and stays the same whatever the
teacher picks. The names are reserved, so an exercise resource cannot take or shadow them
(``app.services.latex_resources``).

Mirrored by ``frontend/src/lib/latex/logo.ts``.
"""
from __future__ import annotations

import base64
import binascii
import uuid
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exam import Exam
from app.models.logo import ExamLogo, TeacherLogo

#: Hard cap for a logo file (bytes). It is printed 9 mm tall; anything larger is a scan.
MAX_LOGO_BYTES = 2 * 1024 * 1024

LOGO_BASENAME = "examance-logo"

# Recognised by content, never by the client's claim: the bytes are served back inline.
_MIME_EXTENSIONS = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
}

#: Every name a logo can have in the working directory. Reserved for resource uploads.
LOGO_FILENAMES = frozenset(f"{LOGO_BASENAME}.{ext}" for ext in ("pdf", "png", "jpg", "jpeg"))

#: Where a printed logo comes from: the bundled default, the account's own file, the exam's own
#: file, or nowhere.
LogoSource = Literal["default", "account", "exam", "none"]

# The default logo: what every exam printed before logos were configurable. Resolved like
# ``app.services.latex.ASSETS_DIR``.
_ASSETS_DIR = Path(__file__).resolve().parents[2] / "latex-assets"
if not _ASSETS_DIR.exists():
    _ASSETS_DIR = Path("latex-assets")
DEFAULT_LOGO_PATH = _ASSETS_DIR / "img" / "logo_mtg.pdf"


class LogoError(ValueError):
    """Raised when an uploaded logo is not an acceptable image."""


@dataclass(frozen=True)
class ResolvedLogo:
    mime_type: str
    content: bytes

    @property
    def filename(self) -> str:
        return logo_filename(self.mime_type)


def sniff_logo_mime(content: bytes) -> str:
    """Return the logo's MIME type from its magic bytes, or raise :class:`LogoError`."""
    if content.startswith(b"%PDF-"):
        return "application/pdf"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    raise LogoError("The logo must be a PNG, JPEG or PDF file.")


def decode_logo(content_b64: str) -> tuple[bytes, str]:
    """Decode and validate an uploaded logo. Returns ``(bytes, mime_type)``."""
    try:
        content = base64.b64decode(content_b64, validate=True)
    except (binascii.Error, ValueError):
        raise LogoError("Logo content is not valid base64.") from None
    if not content:
        raise LogoError("The logo file is empty.")
    if len(content) > MAX_LOGO_BYTES:
        raise LogoError(
            f"The logo is larger than {MAX_LOGO_BYTES // (1024 * 1024)} MB. "
            "Use a smaller image or a PDF."
        )
    return content, sniff_logo_mime(content)


@cache
def _default_logo_bytes() -> bytes | None:
    try:
        return DEFAULT_LOGO_PATH.read_bytes()
    except OSError:
        return None


def default_logo() -> ResolvedLogo | None:
    """The bundled default logo, or None if the image ships without it."""
    content = _default_logo_bytes()
    return ResolvedLogo("application/pdf", content) if content else None


def logo_filename(mime_type: str) -> str:
    return f"{LOGO_BASENAME}.{_MIME_EXTENSIONS.get(mime_type, 'pdf')}"


async def get_teacher_logo(teacher_id: uuid.UUID, db: AsyncSession) -> TeacherLogo | None:
    return await db.get(TeacherLogo, teacher_id)


async def get_exam_logo(exam_id: uuid.UUID, db: AsyncSession) -> ExamLogo | None:
    return await db.get(ExamLogo, exam_id)


async def resolve_logo(
    teacher_id: uuid.UUID,
    exam_id: uuid.UUID | None,
    db: AsyncSession,
) -> tuple[LogoSource, ResolvedLogo | None]:
    """
    The logo an exam prints, and where it comes from.

    *exam_id* must already be known to belong to *teacher_id*; ``None`` asks for the account
    logo (an exam that does not exist on the server yet).
    """
    if exam_id is not None:
        override = await get_exam_logo(exam_id, db)
        if override is not None:
            if override.mode == "custom" and override.content and override.mime_type:
                return "exam", ResolvedLogo(override.mime_type, override.content)
            return "none", None

    return resolve_account_logo(await get_teacher_logo(teacher_id, db))


def resolve_account_logo(account: TeacherLogo | None) -> tuple[LogoSource, ResolvedLogo | None]:
    """The account's logo: no row is the default, ``none`` prints nothing, ``custom`` its file."""
    if account is None:
        logo = default_logo()
        return ("default", logo) if logo else ("none", None)
    if account.mode == "custom" and account.content and account.mime_type:
        return "account", ResolvedLogo(account.mime_type, account.content)
    return "none", None


async def resolve_logo_for_compile(
    teacher_id: uuid.UUID,
    exam_id: uuid.UUID | None,
    db: AsyncSession,
) -> ResolvedLogo | None:
    """
    Like :func:`resolve_logo`, for a compile request naming *exam_id*. An exam the teacher does
    not own (or that is gone) falls back to the account logo instead of failing: the id is a
    hint about which header to print, and must never read another tenant's logo.
    """
    if exam_id is not None:
        owned = await db.scalar(
            select(Exam.id).where(
                Exam.id == exam_id, Exam.teacher_id == teacher_id, Exam.deleted_at.is_(None)
            )
        )
        if owned is None:
            exam_id = None
    _, logo = await resolve_logo(teacher_id, exam_id, db)
    return logo
