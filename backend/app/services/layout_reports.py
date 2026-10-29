"""Layout reports (issue #134): admin notices and the resolve step."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal, cast

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.layout_report import LayoutReport
from app.models.teacher import Teacher
from app.services import account_mail
from app.services.account_mail import Mail
from app.services.registration import ADMIN_NOTICE_QUIET_MINUTES
from app.services.tokens import rowcount


async def open_count(db: AsyncSession) -> int:
    return (
        await db.scalar(
            select(func.count()).select_from(LayoutReport).where(LayoutReport.status == "open")
        )
    ) or 0


async def admin_notices(db: AsyncSession, new_report: LayoutReport) -> list[Mail]:
    """Mails to every approved admin; throttled like registration notices (a report from the quiet period already announced this one)."""
    since = datetime.now(UTC) - timedelta(minutes=ADMIN_NOTICE_QUIET_MINUTES)
    recent_others = await db.scalar(
        select(func.count())
        .select_from(LayoutReport)
        .where(LayoutReport.id != new_report.id, LayoutReport.created_at >= since)
    )
    if recent_others:
        return []
    pending = await open_count(db)
    admins = await db.scalars(
        select(Teacher.email).where(Teacher.role == "admin", Teacher.approved_at.isnot(None))
    )
    return [account_mail.layout_report_notice_mail(address, pending) for address in admins]


async def resolve(db: AsyncSession, report_id: uuid.UUID, note: str | None) -> Mail | None:
    """Close an open report and return the reporter's mail; an already resolved one is left untouched and mails nobody (one conditional UPDATE, so a double click cannot mail twice)."""
    report = await db.get(LayoutReport, report_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
    note = (note or "").strip() or None
    result = await db.execute(
        update(LayoutReport)
        .where(LayoutReport.id == report_id, LayoutReport.status == "open")
        .values(status="done", resolved_at=datetime.now(UTC), resolution_note=note)
    )
    if rowcount(result) == 0:
        return None
    reporter_email = await db.scalar(select(Teacher.email).where(Teacher.id == report.reporter_id))
    if reporter_email is None:
        return None
    return account_mail.layout_report_resolved_mail(
        reporter_email,
        cast(Literal["exam", "exercise"], report.source_kind),
        report.created_at.date().isoformat(),
        note,
    )
