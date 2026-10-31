"""Layout reports — POST /api/v1/layout-reports, admin inbox /api/v1/admin/layout-reports (#134). The teacher deliberately shares plaintext LaTeX and PDFs with the admins (per-report consent in the client). Quota answers are 429 without ``Retry-After`` (client login lockout), as in training."""
from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal, cast

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_admin_teacher, get_teaching_teacher
from app.models.layout_report import LayoutReport, LayoutReportFile
from app.models.teacher import Teacher
from app.schemas.binary import decode_b64
from app.schemas.layout_report import (
    LayoutReportCreate,
    LayoutReportDetail,
    LayoutReportFileOut,
    LayoutReportList,
    LayoutReportResolve,
    LayoutReportSummary,
)
from app.services import account_mail, ephemeral_store
from app.services import layout_reports as reports_svc
from app.services.latex_resources import resource_response

router = APIRouter(prefix="/layout-reports", tags=["layout-reports"])
admin_router = APIRouter(prefix="/admin/layout-reports", tags=["admin"])

_QUOTA_PREFIX = "layout-report:q:"
_DAY_SECONDS = 24 * 60 * 60


@router.post("", status_code=status.HTTP_204_NO_CONTENT)
async def create_layout_report(
    body: LayoutReportCreate,
    background_tasks: BackgroundTasks,
    teacher: Annotated[Teacher, Depends(get_teaching_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Store a report and notify the admins (count and link only)."""
    now = datetime.now(tz=UTC)
    account_hash = hashlib.sha256(str(teacher.id).encode("ascii")).hexdigest()
    quota_key = f"{_QUOTA_PREFIX}{account_hash}:{now.date().isoformat()}"
    # Reserved atomically up front, so parallel requests cannot all pass the check.
    limit = settings.LAYOUT_REPORTS_PER_TEACHER_PER_DAY
    if await ephemeral_store.incr(quota_key, _DAY_SECONDS) > limit:
        await ephemeral_store.incr(quota_key, _DAY_SECONDS, -1)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Daily layout-report quota reached.",
            headers={"code": "ERR_LAYOUT_REPORT_QUOTA"},
        )

    files = [
        (f, decode_b64(f.content_b64, f"files[{i}].content_b64"))
        for i, f in enumerate(body.files)
    ]
    report = LayoutReport(
        reporter_id=teacher.id,
        source_kind=body.source_kind,
        source_title=body.source_title.strip(),
        engine=body.engine,
        app_version=body.app_version,
        problem=body.problem.strip(),
        expected=body.expected.strip(),
        compile_error=body.compile_error,
        allow_publication=body.allow_publication,
        status="open",
        created_at=now,
    )
    db.add(report)
    await db.flush()
    db.add_all(
        LayoutReportFile(
            report_id=report.id,
            filename=f.filename,
            mime_type=f.mime_type,
            byte_size=len(content),
            content=content,
        )
        for f, content in files
    )
    await db.flush()
    notices = await reports_svc.admin_notices(db, report)
    await db.commit()
    if notices:
        background_tasks.add_task(account_mail.send_all, notices)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _summary(report: LayoutReport, email: str) -> LayoutReportSummary:
    return LayoutReportSummary(
        id=report.id,
        reporter_email=email,
        source_kind=cast(Literal["exam", "exercise"], report.source_kind),
        source_title=report.source_title,
        status=cast(Literal["open", "done"], report.status),
        allow_publication=report.allow_publication,
        problem=report.problem,
        created_at=report.created_at,
        resolved_at=report.resolved_at,
    )


async def _load(db: AsyncSession, report_id: uuid.UUID) -> LayoutReport:
    report = await db.get(LayoutReport, report_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
    return report


@admin_router.get("", response_model=LayoutReportList)
async def list_layout_reports(
    _admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: Annotated[Literal["open", "done"], Query(alias="status")] = "open",
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> LayoutReportList:
    """Reports, newest first (Admin only)."""
    query = select(LayoutReport).where(LayoutReport.status == status_filter)
    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = (
        await db.execute(
            select(LayoutReport, Teacher.email)
            .join(Teacher, Teacher.id == LayoutReport.reporter_id)
            .where(LayoutReport.status == status_filter)
            .order_by(LayoutReport.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
    ).tuples()
    return LayoutReportList(
        items=[_summary(report, email) for report, email in rows],
        total=total,
        open_count=await reports_svc.open_count(db),
    )


@admin_router.get("/{report_id}", response_model=LayoutReportDetail)
async def get_layout_report(
    report_id: uuid.UUID,
    _admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LayoutReportDetail:
    report = await _load(db, report_id)
    email = await db.scalar(select(Teacher.email).where(Teacher.id == report.reporter_id)) or ""
    files = (
        await db.execute(
            select(
                LayoutReportFile.id,
                LayoutReportFile.filename,
                LayoutReportFile.mime_type,
                LayoutReportFile.byte_size,
            )
            .where(LayoutReportFile.report_id == report.id)
            .order_by(LayoutReportFile.filename)
        )
    ).tuples()
    return LayoutReportDetail(
        **_summary(report, email).model_dump(),
        engine=report.engine,
        app_version=report.app_version,
        expected=report.expected,
        compile_error=report.compile_error,
        resolution_note=report.resolution_note,
        files=[
            LayoutReportFileOut(id=fid, filename=name, mime_type=mime, byte_size=size)
            for fid, name, mime, size in files
        ],
    )


@admin_router.get("/{report_id}/files/{file_id}")
async def download_layout_report_file(
    report_id: uuid.UUID,
    file_id: uuid.UUID,
    _admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """One attached file; served like exercise resources (only PDF/PNG/JPEG inline)."""
    # `content` is deferred: a lazy load on the async session would fail, so select it explicitly.
    row = (
        await db.execute(
            select(
                LayoutReportFile.content, LayoutReportFile.mime_type, LayoutReportFile.filename
            ).where(LayoutReportFile.id == file_id, LayoutReportFile.report_id == report_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")
    content, mime_type, filename = row
    return resource_response(content, mime_type, filename)


@admin_router.post("/{report_id}/resolve", status_code=status.HTTP_204_NO_CONTENT)
async def resolve_layout_report(
    report_id: uuid.UUID,
    body: LayoutReportResolve,
    background_tasks: BackgroundTasks,
    _admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Mark resolved and tell the reporter by mail (with the optional note). Idempotent."""
    mail = await reports_svc.resolve(db, report_id, body.note)
    await db.commit()
    if mail is not None:
        background_tasks.add_task(account_mail.send_all, [mail])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@admin_router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_layout_report(
    report_id: uuid.UUID,
    _admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    report = await _load(db, report_id)
    # Files first: SQLite (tests) does not enforce the ON DELETE CASCADE.
    await db.execute(delete(LayoutReportFile).where(LayoutReportFile.report_id == report.id))
    await db.delete(report)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
