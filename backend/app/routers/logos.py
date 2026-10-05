"""Exam header logos (issue #46) — /api/v1/user/logo and /api/v1/exams/{id}/logo.

The account logo is printed on every exam; an exam may print none or its own instead
(``app.services.logo``). Bytes travel as base64 JSON like exercise resources and are served
back only to their owner, as an image or PDF with sniffing disabled.
"""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_teacher, get_exam_for_teacher
from app.models.exam import Exam
from app.models.logo import ExamLogo, TeacherLogo
from app.models.teacher import Teacher
from app.schemas.logo import ExamLogoInfo, ExamLogoUpdate, LogoInfo, LogoUpload
from app.services.logo import (
    LogoError,
    ResolvedLogo,
    decode_logo,
    get_exam_logo,
    get_teacher_logo,
    resolve_logo,
)

router = APIRouter(tags=["logos"])


def _decode_or_422(content_b64: str) -> tuple[bytes, str]:
    try:
        return decode_logo(content_b64)
    except LogoError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
            headers={"code": "ERR_LOGO_INVALID"},
        ) from exc


def _logo_response(logo: ResolvedLogo | None) -> Response:
    if logo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No logo.")
    return Response(
        content=logo.content,
        media_type=logo.mime_type,
        headers={
            "Content-Disposition": f'inline; filename="{logo.filename}"',
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox; default-src 'none'",
            "Cache-Control": "no-store",
        },
    )


def _account_info(logo: TeacherLogo | None) -> LogoInfo:
    if logo is None:
        return LogoInfo(source="none")
    return LogoInfo(
        source="account",
        mime_type=logo.mime_type,
        byte_size=logo.byte_size,
        updated_at=logo.updated_at,
    )


# --- account logo -------------------------------------------------------------------------


@router.get("/user/logo", response_model=LogoInfo)
async def get_account_logo(
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> LogoInfo:
    """The account logo's metadata (`source: none` when there is none)."""
    return _account_info(await get_teacher_logo(teacher.id, db))


@router.get("/user/logo/file")
async def download_account_logo(
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> Response:
    row = await get_teacher_logo(teacher.id, db)
    return _logo_response(ResolvedLogo(row.mime_type, row.content) if row else None)


@router.put("/user/logo", response_model=LogoInfo)
async def set_account_logo(
    body: LogoUpload,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> LogoInfo:
    """Replace the account logo. PNG, JPEG or PDF, at most 2 MB."""
    content, mime_type = _decode_or_422(body.content_b64)
    row = await get_teacher_logo(teacher.id, db)
    if row is None:
        row = TeacherLogo(teacher_id=teacher.id)
        db.add(row)
    row.content = content
    row.mime_type = mime_type
    row.byte_size = len(content)
    row.updated_at = datetime.now(UTC)
    await db.flush()
    return _account_info(row)


@router.delete("/user/logo", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account_logo(
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove the account logo. Exams that follow it then print no logo."""
    row = await get_teacher_logo(teacher.id, db)
    if row is not None:
        await db.delete(row)


# --- exam logo ----------------------------------------------------------------------------


async def _exam_info(exam: Exam, teacher: Teacher, db: AsyncSession) -> ExamLogoInfo:
    override = await get_exam_logo(exam.id, db)
    source, logo = await resolve_logo(teacher.id, exam.id, db)
    updated_at: datetime | None = None
    if source == "exam" and override is not None:
        updated_at = override.updated_at
    elif source == "account":
        account = await get_teacher_logo(teacher.id, db)
        updated_at = account.updated_at if account else None
    return ExamLogoInfo(
        mode="account" if override is None else override.mode,  # type: ignore[arg-type]  # ck_exam_logos_mode
        source=source,
        mime_type=logo.mime_type if logo else None,
        byte_size=len(logo.content) if logo else 0,
        updated_at=updated_at,
    )


@router.get("/exams/{exam_id}/logo", response_model=ExamLogoInfo)
async def get_exam_logo_info(
    exam: Exam = Depends(get_exam_for_teacher),
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExamLogoInfo:
    """The exam's logo setting and the logo it resolves to."""
    return await _exam_info(exam, teacher, db)


@router.get("/exams/{exam_id}/logo/file")
async def download_exam_logo(
    exam: Exam = Depends(get_exam_for_teacher),
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """The logo this exam prints (its own or the account's); 404 when it prints none."""
    _, logo = await resolve_logo(teacher.id, exam.id, db)
    return _logo_response(logo)


@router.put("/exams/{exam_id}/logo", response_model=ExamLogoInfo)
async def set_exam_logo(
    body: ExamLogoUpdate,
    exam: Exam = Depends(get_exam_for_teacher),
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExamLogoInfo:
    """
    Choose the exam's logo: follow the account (`account`), print none (`none`), or print its
    own (`custom`, with `content_b64` to replace the stored file).
    """
    row = await get_exam_logo(exam.id, db)

    if body.mode == "account":
        if row is not None:
            await db.delete(row)
            await db.flush()
        return await _exam_info(exam, teacher, db)

    if body.mode == "custom" and body.content_b64 is None and (
        row is None or row.mode != "custom"
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="A custom logo needs a file.",
            headers={"code": "ERR_LOGO_INVALID"},
        )

    if row is None:
        row = ExamLogo(exam_id=exam.id)
        db.add(row)
    row.mode = body.mode
    if body.mode == "none":
        row.content = None
        row.mime_type = None
        row.byte_size = 0
    elif body.content_b64 is not None:
        content, mime_type = _decode_or_422(body.content_b64)
        row.content = content
        row.mime_type = mime_type
        row.byte_size = len(content)
    row.updated_at = datetime.now(UTC)
    await db.flush()
    return await _exam_info(exam, teacher, db)
