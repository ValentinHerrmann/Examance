"""Grading review records (issue #226) — /api/v1/exams/{id}/submissions/{id}/grading-review. One client-sealed payload per submission; PUT is an idempotent upsert."""
from __future__ import annotations

import base64
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import (
    get_exam_for_teacher,
    get_submission_for_teacher,
    get_teaching_teacher,
)
from app.models.exam import Exam
from app.models.grading_review import GradingReview
from app.models.scan_submission import ScanSubmission
from app.schemas.binary import GCM_IV_BYTES, decode_b64
from app.schemas.grading_review import GradingReviewIn, GradingReviewResponse
from app.services.capabilities import require_server_results_writable

router = APIRouter(
    prefix="/exams/{exam_id}/submissions/{submission_id}/grading-review",
    tags=["grading-reviews"],
    dependencies=[Depends(get_teaching_teacher)],
)
# Exam-wide read: one request for the results pages instead of one per submission.
exam_router = APIRouter(
    prefix="/exams/{exam_id}/grading-reviews",
    tags=["grading-reviews"],
    dependencies=[Depends(get_teaching_teacher)],
)


def _b64(value: bytes | None) -> str | None:
    return base64.b64encode(value).decode() if value else None


def _to_response(row: GradingReview) -> GradingReviewResponse:
    return GradingReviewResponse(
        id=row.id,
        submission_id=row.submission_id,
        payload_ciphertext_b64=_b64(row.payload_ciphertext),
        payload_iv_b64=_b64(row.payload_iv),
        updated_at=row.updated_at,
    )


async def _for_submission(db: AsyncSession, submission_id: uuid.UUID) -> GradingReview | None:
    return await db.scalar(select(GradingReview).where(GradingReview.submission_id == submission_id))


async def _insert(
    db: AsyncSession,
    exam_id: uuid.UUID,
    submission_id: uuid.UUID,
    wanted_id: uuid.UUID | None,
    payload: bytes | None,
    iv: bytes | None,
) -> GradingReview:
    """Insert in a savepoint; a concurrent first PUT (same submission) loses the race and updates the winner's row."""
    # A client id that belongs to another submission's row is ignored, never reused.
    taken = wanted_id is not None and await db.get(GradingReview, wanted_id) is not None
    row = GradingReview(exam_id=exam_id, submission_id=submission_id, payload_ciphertext=payload, payload_iv=iv)
    if wanted_id is not None and not taken:
        row.id = wanted_id
    try:
        async with db.begin_nested():
            db.add(row)
            await db.flush()
    except IntegrityError:
        existing = await _for_submission(db, submission_id)
        if existing is None:
            raise
        existing.payload_ciphertext = payload
        existing.payload_iv = iv
        await db.flush()
        row = existing
    await db.refresh(row)
    return row


@exam_router.get("")
async def list_exam_grading_reviews(
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> list[GradingReviewResponse]:
    rows = await db.execute(
        select(GradingReview)
        .join(ScanSubmission, ScanSubmission.id == GradingReview.submission_id)
        .where(ScanSubmission.exam_id == exam.id, ScanSubmission.deleted_at.is_(None))
    )
    return [_to_response(row) for row in rows.scalars()]


@router.get("")
async def get_grading_review(
    submission: ScanSubmission = Depends(get_submission_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> GradingReviewResponse | None:
    """The submission's record, or null while there is none."""
    row = await _for_submission(db, submission.id)
    return _to_response(row) if row is not None else None


@router.put("", dependencies=[Depends(require_server_results_writable)])
async def put_grading_review(
    body: GradingReviewIn,
    exam: Exam = Depends(get_exam_for_teacher),
    submission: ScanSubmission = Depends(get_submission_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> GradingReviewResponse:
    """Upsert by submission, never by the client's id, so a replay updates in place instead of answering 409."""
    payload = (
        decode_b64(body.payload_ciphertext_b64, "payload_ciphertext_b64")
        if body.payload_ciphertext_b64
        else None
    )
    iv = (
        decode_b64(body.payload_iv_b64, "payload_iv_b64", expected_len=GCM_IV_BYTES)
        if body.payload_iv_b64
        else None
    )
    row = await _for_submission(db, submission.id)
    if row is None:
        row = await _insert(db, exam.id, submission.id, body.id, payload, iv)
        return _to_response(row)
    row.payload_ciphertext = payload
    row.payload_iv = iv
    await db.flush()
    await db.refresh(row)
    return _to_response(row)
