"""Per-exercise score endpoints — /api/v1/exams/{id}/submissions/{id}/scores.

Per-question grading results used to have no server home at all: they lived only
in the client's Dexie store, in every storage mode, and `lockSession()` wipes
IndexedDB in `all-server` mode on the idle timeout. This router is what makes a
grading session in server mode survive the lock.

The payload is opaque here — score, selected options and OMR metadata are sealed
client-side into one AES-256-GCM blob (see `encryptScore` in
lib/db/dbEncryption.ts). Statistics that need a number use
`scan_submissions.total_score`, which stays plaintext.
"""
from __future__ import annotations

import base64
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
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

# Read-only companion: one request for a whole exam instead of one per
# submission, which is what the stats and analytics pages need.
exam_router = APIRouter(prefix="/exams/{exam_id}/scores", tags=["exercise-scores"])


def _to_response(row: ExerciseScore) -> ExerciseScoreResponse:
    return ExerciseScoreResponse(
        id=row.id,
        submission_id=row.submission_id,
        exercise_id=row.exercise_id,
        payload_ciphertext_b64=(
            base64.b64encode(row.payload_ciphertext).decode() if row.payload_ciphertext else None
        ),
        payload_iv_b64=(base64.b64encode(row.payload_iv).decode() if row.payload_iv else None),
        updated_at=row.updated_at,
    )


@router.get("", response_model=list[ExerciseScoreResponse])
async def list_scores(
    submission: ScanSubmission = Depends(get_submission_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> list[ExerciseScoreResponse]:
    """Every stored score for one submission. Empty list, never 404."""
    result = await db.execute(
        select(ExerciseScore).where(ExerciseScore.submission_id == submission.id)
    )
    return [_to_response(row) for row in result.scalars().all()]


@exam_router.get("", response_model=list[ExerciseScoreResponse])
async def list_exam_scores(
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> list[ExerciseScoreResponse]:
    """Every stored score across an exam's live submissions, in one query."""
    result = await db.execute(
        select(ExerciseScore)
        .join(ScanSubmission, ScanSubmission.id == ExerciseScore.submission_id)
        .where(
            ScanSubmission.exam_id == exam.id,
            ScanSubmission.deleted_at.is_(None),
        )
    )
    return [_to_response(row) for row in result.scalars().all()]


@router.put("", response_model=list[ExerciseScoreResponse])
async def put_scores(
    body: ExerciseScoreBulkPut,
    exam: Exam = Depends(get_exam_for_teacher),
    submission: ScanSubmission = Depends(get_submission_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> list[ExerciseScoreResponse]:
    """
    Upsert the given scores for this submission.

    Idempotent by design, and that is the whole point: rows are resolved by
    ``(submission_id, exercise_id)``, never by the client's ``id``, so replaying
    the same write — an offline-queue flush, a double-click, a retried
    autosave — updates the row in place instead of answering 409 the way the
    create-only POST endpoints do. A client-supplied ``id`` seeds a new row only
    when that pair does not exist yet.

    Scores not named in the body are left alone. Clearing one exercise back to
    ungraded is a DELETE, so a partial save cannot silently drop the rest.
    """
    if not body.scores:
        return await list_scores(submission=submission, db=db)

    requested_ids = {s.exercise_id for s in body.scores}

    # An exercise not linked to this exam has no business carrying a score for
    # one of its submissions. 404 rather than 400, matching how the other
    # ownership checks decline to distinguish "not yours" from "not there".
    linked = await db.execute(
        select(ExamExercise.exercise_id).where(
            ExamExercise.exam_id == exam.id,
            ExamExercise.exercise_id.in_(requested_ids),
        )
    )
    linked_ids = set(linked.scalars().all())
    unknown = requested_ids - linked_ids
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or more exercises are not part of this exam.",
        )

    existing_res = await db.execute(
        select(ExerciseScore).where(
            ExerciseScore.submission_id == submission.id,
            ExerciseScore.exercise_id.in_(requested_ids),
        )
    )
    existing = {row.exercise_id: row for row in existing_res.scalars().all()}

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
        if row is not None:
            row.payload_ciphertext = payload
            row.payload_iv = iv
            continue

        kwargs: dict[str, object] = {
            "submission_id": submission.id,
            "exercise_id": item.exercise_id,
            "payload_ciphertext": payload,
            "payload_iv": iv,
        }
        if item.id is not None:
            kwargs["id"] = item.id
        db.add(ExerciseScore(**kwargs))

    await db.flush()
    return await list_scores(submission=submission, db=db)


@router.delete("/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_score(
    exercise_id: uuid.UUID,
    submission: ScanSubmission = Depends(get_submission_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """
    Reset one exercise to ungraded.

    Idempotent: a row that is not there is already in the requested state, so
    this answers 204 rather than 404. Grading fires this whenever a score input
    is cleared, and a 404 there would raise the global HTTP error modal over a
    keystroke.
    """
    rows = await db.execute(
        select(ExerciseScore).where(
            ExerciseScore.submission_id == submission.id,
            ExerciseScore.exercise_id == exercise_id,
        )
    )
    for row in rows.scalars().all():
        await db.delete(row)
    await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_all_scores(
    submission: ScanSubmission = Depends(get_submission_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Drop every score for this submission — the 'clear grading' path."""
    rows = await db.execute(
        select(ExerciseScore).where(ExerciseScore.submission_id == submission.id)
    )
    for row in rows.scalars().all():
        await db.delete(row)
    await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
