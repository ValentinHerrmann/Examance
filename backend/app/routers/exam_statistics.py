"""Exam statistics (issue #238): one client-sealed, anonymised record per exam, kept after results are purged. Deliberately not gated by server_results: it holds no per-student data."""
from __future__ import annotations

import base64
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_exam_for_teacher, get_teaching_teacher
from app.models.exam import Exam
from app.models.exam_statistics import ExamStatistics
from app.models.teacher import Teacher
from app.schemas.binary import GCM_IV_BYTES, decode_b64
from app.schemas.exam_statistics import ExamStatisticsIn, ExamStatisticsKeepIn, ExamStatisticsOut

router = APIRouter(tags=["exam-statistics"], dependencies=[Depends(get_teaching_teacher)])

MAX_CIPHERTEXT_BYTES = 4 * 1024 * 1024
MIN_CIPHERTEXT_BYTES = 16  # the GCM tag alone


def _to_out(row: ExamStatistics) -> ExamStatisticsOut:
    return ExamStatisticsOut(
        id=row.id,
        exam_id=row.exam_id,
        keep_after_exam_delete=row.keep_after_exam_delete,
        computed_at=row.computed_at,
        updated_at=row.updated_at,
        payload_ciphertext_b64=base64.b64encode(row.payload_ciphertext).decode(),
        payload_iv_b64=base64.b64encode(row.payload_iv).decode(),
    )


def _decode_payload(body: ExamStatisticsIn) -> tuple[bytes, bytes]:
    """Strict base64, then the size rules; 422 for a malformed payload, 413 over the cap."""
    try:
        ciphertext = decode_b64(body.payload_ciphertext_b64, "payload_ciphertext_b64")
        iv = decode_b64(body.payload_iv_b64, "payload_iv_b64", expected_len=GCM_IV_BYTES)
    except HTTPException as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=exc.detail
        ) from None
    if len(ciphertext) > MAX_CIPHERTEXT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="The statistics record is too large.",
            headers={"code": "ERR_STATISTICS_TOO_LARGE"},
        )
    if len(ciphertext) < MIN_CIPHERTEXT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Field 'payload_ciphertext_b64' is too short.",
        )
    return ciphertext, iv


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


async def _own(db: AsyncSession, teacher: Teacher, stats_id: uuid.UUID) -> ExamStatistics:
    row = await db.scalar(
        select(ExamStatistics).where(
            ExamStatistics.id == stats_id, ExamStatistics.teacher_id == teacher.id
        )
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Statistics not found.",
            headers={"code": "ERR_STATISTICS_NOT_FOUND"},
        )
    return row


@router.get("/statistics")
async def list_statistics(
    teacher: Annotated[Teacher, Depends(get_teaching_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ExamStatisticsOut]:
    """Every statistics record of the teacher, including those whose exam was deleted (its exam_id no longer lists in GET /exams)."""
    rows = await db.scalars(
        select(ExamStatistics)
        .where(ExamStatistics.teacher_id == teacher.id)
        .order_by(ExamStatistics.computed_at.desc(), ExamStatistics.id)
    )
    return [_to_out(row) for row in rows]


@router.put("/exams/{exam_id}/statistics")
async def put_statistics(
    body: ExamStatisticsIn,
    exam: Annotated[Exam, Depends(get_exam_for_teacher)],
    teacher: Annotated[Teacher, Depends(get_teaching_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ExamStatisticsOut:
    """Create or replace the exam's record; idempotent, and an older computed_at never replaces a newer one (409)."""
    ciphertext, iv = _decode_payload(body)
    computed_at = _aware(body.computed_at)
    row = await db.scalar(select(ExamStatistics).where(ExamStatistics.exam_id == exam.id))
    if row is None:
        row = ExamStatistics(
            teacher_id=teacher.id,
            exam_id=exam.id,
            payload_ciphertext=ciphertext,
            payload_iv=iv,
            byte_size=len(ciphertext),
            computed_at=computed_at,
        )
        db.add(row)
    else:
        if _aware(row.computed_at) > computed_at:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A newer statistics record exists.",
                headers={"code": "ERR_STATISTICS_STALE"},
            )
        row.payload_ciphertext = ciphertext
        row.payload_iv = iv
        row.byte_size = len(ciphertext)
        row.computed_at = computed_at
        row.updated_at = datetime.now(UTC)
    await db.flush()
    await db.refresh(row)
    return _to_out(row)


@router.patch("/statistics/{stats_id}")
async def set_keep(
    stats_id: uuid.UUID,
    body: ExamStatisticsKeepIn,
    teacher: Annotated[Teacher, Depends(get_teaching_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ExamStatisticsOut:
    """Whether the record survives a deletion of its exam; the teacher chooses in the exam delete dialog."""
    row = await _own(db, teacher, stats_id)
    row.keep_after_exam_delete = body.keep_after_exam_delete
    await db.flush()
    await db.refresh(row)
    return _to_out(row)


@router.delete("/statistics/{stats_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_statistics(
    stats_id: uuid.UUID,
    teacher: Annotated[Teacher, Depends(get_teaching_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    row = await _own(db, teacher, stats_id)
    await db.delete(row)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
