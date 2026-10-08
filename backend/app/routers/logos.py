"""Exam header logos (issue #46) — /api/v1/user/logo and /api/v1/exams/{id}/logo.

An account prints the bundled default logo (MTG) until it chooses its own file or none; an exam
follows its account, prints none, or prints its own (``app.services.logo``). Bytes travel as
base64 JSON like exercise resources and are served back only to their owner, as an image or PDF
with sniffing disabled.
"""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_teacher, get_exam_for_teacher, get_teaching_teacher
from app.models.exam import Exam
from app.models.logo import ExamLogo, TeacherLogo
from app.models.teacher import Teacher
from app.schemas.logo import AccountLogoInfo, AccountLogoUpdate, ExamLogoInfo, ExamLogoUpdate
from app.services.logo import (
    LogoError,
    ResolvedLogo,
    decode_logo,
    get_exam_logo,
    get_teacher_logo,
    resolve_account_logo,
    resolve_logo,
)

router = APIRouter(tags=["logos"], dependencies=[Depends(get_teaching_teacher)])


def _invalid(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=detail,
        headers={"code": "ERR_LOGO_INVALID"},
    )


def _apply_choice(row: TeacherLogo | ExamLogo, mode: str, content_b64: str | None) -> None:
    """Writes a `none` or `custom` choice onto *row*. `custom` without content keeps the file."""
    if mode == "custom" and content_b64 is None and (row.mode != "custom" or not row.content):
        raise _invalid("A custom logo needs a file.")
    if mode == "none":
        row.content = None
        row.mime_type = None
        row.byte_size = 0
    elif content_b64 is not None:
        try:
            content, mime_type = decode_logo(content_b64)
        except LogoError as exc:
            raise _invalid(str(exc)) from exc
        row.content = content
        row.mime_type = mime_type
        row.byte_size = len(content)
    row.mode = mode
    row.updated_at = datetime.now(UTC)


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


# --- account logo -------------------------------------------------------------------------


def _account_info(row: TeacherLogo | None) -> AccountLogoInfo:
    source, logo = resolve_account_logo(row)
    return AccountLogoInfo(
        mode="default" if row is None else row.mode,  # type: ignore[arg-type]  # ck_teacher_logos_mode
        source=source,
        mime_type=logo.mime_type if logo else None,
        byte_size=len(logo.content) if logo else 0,
        updated_at=row.updated_at if row else None,
    )


@router.get("/user/logo", response_model=AccountLogoInfo)
async def get_account_logo(
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> AccountLogoInfo:
    """The account's logo setting (`default`, `none`, `custom`) and what it prints."""
    return _account_info(await get_teacher_logo(teacher.id, db))


@router.get("/user/logo/file")
async def download_account_logo(
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """The logo the account prints (its own or the default); 404 when it prints none."""
    _, logo = resolve_account_logo(await get_teacher_logo(teacher.id, db))
    return _logo_response(logo)


@router.put("/user/logo", response_model=AccountLogoInfo)
async def set_account_logo(
    body: AccountLogoUpdate,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> AccountLogoInfo:
    """
    Choose the account logo: the bundled default (`default`), none (`none`), or its own file
    (`custom`, PNG, JPEG or PDF up to 2 MB in `content_b64`).
    """
    row = await get_teacher_logo(teacher.id, db)
    if body.mode == "default":
        if row is not None:
            await db.delete(row)
            await db.flush()
        return _account_info(None)

    if row is None:
        row = TeacherLogo(teacher_id=teacher.id, mode=body.mode)
        db.add(row)
    _apply_choice(row, body.mode, body.content_b64)
    await db.flush()
    return _account_info(row)


@router.delete("/user/logo", response_model=AccountLogoInfo)
async def reset_account_logo(
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> AccountLogoInfo:
    """Reset the account logo to the default; same as `PUT {"mode": "default"}`."""
    row = await get_teacher_logo(teacher.id, db)
    if row is not None:
        await db.delete(row)
        await db.flush()
    return _account_info(None)


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
    """The logo this exam prints (its own, the account's, or the default); 404 for none."""
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

    if row is None:
        row = ExamLogo(exam_id=exam.id, mode=body.mode)
        db.add(row)
    _apply_choice(row, body.mode, body.content_b64)
    await db.flush()
    return await _exam_info(exam, teacher, db)
