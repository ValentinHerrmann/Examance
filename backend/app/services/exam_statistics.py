"""Lifecycle of exam statistics (issue #238): the only place that drops records when their exam is erased for good."""
from __future__ import annotations

import uuid
from collections.abc import Collection

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exam_statistics import ExamStatistics


async def forget_exams(db: AsyncSession, exam_ids: Collection[uuid.UUID]) -> None:
    """Erase the statistics of exams gone for good unless the teacher chose to keep them; a results purge never calls this."""
    if not exam_ids:
        return
    await db.execute(
        delete(ExamStatistics).where(
            ExamStatistics.exam_id.in_(list(exam_ids)),
            ExamStatistics.keep_after_exam_delete.is_(False),
        )
    )
