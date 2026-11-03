"""Delivery status of result mails and Artemis messages (issue #221, docs/dev/result_sharing.md). The only code that reads or writes `result_deliveries`."""
from __future__ import annotations

import secrets
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exam import Exam
from app.models.result_delivery import ResultDelivery
from app.schemas.result_share import ResultDeliveryOut

# How long the share dialog waits for bounces after an e-mail run; later bounces are forwarded to the teacher.
BOUNCE_WATCH_SECONDS = 30
_DETAIL_MAX = 200


def new_token() -> str:
    return secrets.token_hex(16)


def to_out(row: ResultDelivery) -> ResultDeliveryOut:
    return ResultDeliveryOut(
        student_key=row.student_key,
        channel=row.channel,  # type: ignore[arg-type]
        status=row.status,  # type: ignore[arg-type]
        detail=row.detail,
        updated_at=row.updated_at,
        watch_until=row.watch_until,
    )


async def require_own_exam(db: AsyncSession, teacher_id: uuid.UUID, exam_id: uuid.UUID) -> None:
    """404 unless *exam_id* is a live exam of the teacher (for endpoints that get the exam in the body)."""
    found = await db.scalar(
        select(Exam.id).where(
            Exam.id == exam_id, Exam.teacher_id == teacher_id, Exam.deleted_at.is_(None)
        )
    )
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exam not found.")


async def record(
    db: AsyncSession,
    teacher_id: uuid.UUID,
    exam_id: uuid.UUID,
    student_key: str,
    channel: str,
    outcome: str,
    *,
    detail: str | None = None,
    mail_token: str | None = None,
) -> None:
    """Upsert one student's status; a resend replaces the earlier row and restarts the bounce window."""
    now = datetime.now(UTC)
    row = await db.scalar(
        select(ResultDelivery).where(
            ResultDelivery.exam_id == exam_id,
            ResultDelivery.student_key == student_key,
            ResultDelivery.channel == channel,
        )
    )
    if row is None:
        row = ResultDelivery(
            teacher_id=teacher_id, exam_id=exam_id, student_key=student_key, channel=channel
        )
        db.add(row)
    row.teacher_id = teacher_id
    row.status = outcome
    row.detail = detail[:_DETAIL_MAX] if detail else None
    row.mail_token = mail_token
    row.watch_until = now + timedelta(seconds=BOUNCE_WATCH_SECONDS)
    row.created_at = now
    row.updated_at = now
    await db.flush()


async def list_for_exam(db: AsyncSession, exam_id: uuid.UUID) -> Sequence[ResultDelivery]:
    return (
        await db.scalars(
            select(ResultDelivery)
            .where(ResultDelivery.exam_id == exam_id)
            .order_by(ResultDelivery.updated_at)
        )
    ).all()


async def close_window(db: AsyncSession, exam_id: uuid.UUID, teacher_id: uuid.UUID) -> None:
    """The teacher left the dialog: bounces from now on are forwarded to them by mail."""
    now = datetime.now(UTC)
    await db.execute(
        update(ResultDelivery)
        .where(
            ResultDelivery.exam_id == exam_id,
            ResultDelivery.teacher_id == teacher_id,
            ResultDelivery.watch_until > now,
        )
        .values(watch_until=now)
    )


async def by_token(db: AsyncSession, token: str) -> ResultDelivery | None:
    return await db.scalar(select(ResultDelivery).where(ResultDelivery.mail_token == token))


def apply_bounce(row: ResultDelivery, action: str, smtp_status: str | None) -> None:
    """Mark *row* bounced or delayed; a later "delayed" never hides a bounce."""
    if action == "delayed" and row.status == "bounced":
        return
    row.status = "bounced" if action == "failed" else "delayed"
    row.detail = smtp_status
    row.updated_at = datetime.now(UTC)


async def drop_exams(db: AsyncSession, exam_ids: Sequence[uuid.UUID]) -> None:
    """Statuses are not captured into the trash: a restored exam starts without them."""
    if exam_ids:
        await db.execute(delete(ResultDelivery).where(ResultDelivery.exam_id.in_(exam_ids)))


async def purge_older_than(db: AsyncSession, cutoff: datetime, *, dry_run: bool = False) -> int:
    """Retention: delete statuses last updated before *cutoff*; returns how many."""
    stale = (
        await db.scalars(select(ResultDelivery.id).where(ResultDelivery.updated_at < cutoff))
    ).all()
    if stale and not dry_run:
        await db.execute(delete(ResultDelivery).where(ResultDelivery.id.in_(stale)))
    return len(stale)
