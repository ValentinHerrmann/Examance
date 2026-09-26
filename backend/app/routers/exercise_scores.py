"""Per-exercise scores — /api/v1/exams/{id}/submissions/{id}/scores.

The payload (score, selected options, OMR metadata) is sealed client-side; the
server stores only the ciphertext. Writes are keyed on (submission, exercise),
so every endpoint here is idempotent and safe to replay from the offline queue.
"""
from __future__ import annotations

import base64
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_exam_for_teacher, get_submission_for_teacher
from app.models.exam import Exam
from app.models.exam_exercise import ExamExercise
from app.models.exercise_score import ExerciseScore
from app.models.scan_submission import ScanSubmission
from app.schemas.binary import GCM_IV_BYTES, decode_b64
from app.schemas.exercise_score import ExerciseScoreBulkPut, ExerciseScoreResponse

router = APIRouter(
    prefix="/exams/{exam_id}/submissions/{submission_id}/scores",
    tags=["exercise-scores"],
)
# Exam-wide read: one request for the stats page instead of one per submission.
exam_router = APIRouter(prefix="/exams/{exam_id}/scores", tags=["exercise-scores"])


def _b64(value: bytes | None) -> str | None:
    return base64.b64encode(value).decode() if value else None


def _to_response(row: ExerciseScore) -> ExerciseScoreResponse:
    return ExerciseScoreResponse(
        id=row.id,
        submission_id=row.submission_id,
        exercise_id=row.exercise_id,
        payload_ciphertext_b64=_b64(row.payload_ciphertext),
        payload_iv_b64=_b64(row.payload_iv),
        updated_at=row.updated_at,
    )


@router.get("", response_model=list[ExerciseScoreResponse])
async def list_scores(
    submission: ScanSubmission = Depends(get_submission_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> list[ExerciseScoreResponse]:
    rows = await db.execute(
        select(ExerciseScore).where(ExerciseScore.submission_id == submission.id)
    )
    return [_to_response(row) for row in rows.scalars()]


@exam_router.get("", response_model=list[ExerciseScoreResponse])
async def list_exam_scores(
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> list[ExerciseScoreResponse]:
    rows = await db.execute(
        select(ExerciseScore)
        .join(ScanSubmission, ScanSubmission.id == ExerciseScore.submission_id)
        .where(ScanSubmission.exam_id == exam.id, ScanSubmission.deleted_at.is_(None))
    )
    return [_to_response(row) for row in rows.scalars()]


@router.put("", response_model=list[ExerciseScoreResponse])
async def put_scores(
    body: ExerciseScoreBulkPut,
    exam: Exam = Depends(get_exam_for_teacher),
    submission: ScanSubmission = Depends(get_submission_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> list[ExerciseScoreResponse]:
    """Upsert the listed scores; unlisted ones are left alone (clearing is a DELETE).

    Rows resolve by (submission_id, exercise_id), never by the client's id, so a
    replay updates in place instead of answering 409.
    """
    requested = {s.exercise_id for s in body.scores}
    if requested:
        linked = await db.execute(
            select(ExamExercise.exercise_id).where(
                ExamExercise.exam_id == exam.id, ExamExercise.exercise_id.in_(requested)
            )
        )
        if requested - set(linked.scalars()):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="One or more exercises are not part of this exam.",
            )

    existing_rows = await db.execute(
        select(ExerciseScore).where(
            ExerciseScore.submission_id == submission.id,
            ExerciseScore.exercise_id.in_(requested),
        )
    )
    existing = {row.exercise_id: row for row in existing_rows.scalars()}

    for item in body.scores:
        payload = (
            decode_b64(item.payload_ciphertext_b64, "payload_ciphertext_b64")
            if item.payload_ciphertext_b64
            else None
        )
        iv = (
            decode_b64(item.payload_iv_b64, "payload_iv_b64", expected_len=GCM_IV_BYTES)
            if item.payload_iv_b64
            else None
        )
        row = existing.get(item.exercise_id)
        if row is None:
            row = ExerciseScore(submission_id=submission.id, exercise_id=item.exercise_id)
            if item.id is not None:
                row.id = item.id
            db.add(row)
        row.payload_ciphertext = payload
        row.payload_iv = iv

    await db.flush()
    return await list_scores(submission=submission, db=db)


async def _delete_scores(
    db: AsyncSession, submission_id: uuid.UUID, exercise_id: uuid.UUID | None = None
) -> Response:
    """Idempotent: deleting what is not there is already the requested state."""
    stmt = delete(ExerciseScore).where(ExerciseScore.submission_id == submission_id)
    if exercise_id is not None:
        stmt = stmt.where(ExerciseScore.exercise_id == exercise_id)
    await db.execute(stmt)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_score(
    exercise_id: uuid.UUID,
    submission: ScanSubmission = Depends(get_submission_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> Response:
    return await _delete_scores(db, submission.id, exercise_id)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_all_scores(
    submission: ScanSubmission = Depends(get_submission_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> Response:
    return await _delete_scores(db, submission.id)
