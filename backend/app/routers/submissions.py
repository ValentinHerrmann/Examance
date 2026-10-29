"""Submissions router — /api/v1/exams/{id}/submissions"""
from __future__ import annotations

import base64
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import (
    get_exam_for_teacher,
    get_submission_for_teacher,
    get_teaching_teacher,
)
from app.models.exam import Exam
from app.models.exercise_score import ExerciseScore
from app.models.scan_submission import ScanSubmission
from app.models.student_identity import StudentIdentity
from app.schemas.binary import GCM_IV_BYTES, decode_b64
from app.schemas.submission import SubmissionCreate, SubmissionResponse, SubmissionScoreUpdate
from app.services.capabilities import require_server_results_writable
from app.services.scan_storage import has_scan, load_scan, store_scan


def _upload_conflict() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="A submission with this id already exists, or a parallel upload won the race.",
        headers={"code": "ERR_SUBMISSION_CONFLICT"},
    )


router = APIRouter(
    prefix="/exams/{exam_id}/submissions",
    tags=["submissions"],
    dependencies=[Depends(get_teaching_teacher)],
)


def _b64(data: bytes | None) -> str | None:
    return base64.b64encode(data).decode() if data else None


async def _live_submission(
    sub_id: uuid.UUID,
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> ScanSubmission:
    """`get_submission_for_teacher` under this router's `{sub_id}` path parameter name."""
    return await get_submission_for_teacher(sub_id, exam, db)


def _to_response(
    sub: ScanSubmission, *, scan_present: bool | None = None, **overrides: Any
) -> SubmissionResponse:
    """A submission without scan bytes; *overrides* add them or replace a field. Pass *scan_present* when known: `has_scan` reads a deferred column, which a fresh row lacks."""
    return SubmissionResponse(
        id=sub.id,
        exam_id=sub.exam_id,
        pseudonym_hmac=sub.pseudonym_hmac,
        total_score=sub.total_score,
        scan_iv_b64=_b64(sub.scan_iv),
        annotation_ciphertext_b64=_b64(sub.annotation_ciphertext),
        annotation_iv_b64=_b64(sub.annotation_iv),
        created_at=sub.created_at,
        has_scan=has_scan(sub) if scan_present is None else scan_present,
        has_annotations=bool(sub.annotation_ciphertext),
    ).model_copy(update=overrides)


def _echo(body: SubmissionCreate) -> dict[str, str | None]:
    """An upload answers with the encrypted fields as sent."""
    return {
        "scan_ciphertext_b64": body.scan_ciphertext_b64,
        "scan_iv_b64": body.scan_iv_b64,
        "annotation_ciphertext_b64": body.annotation_ciphertext_b64,
        "annotation_iv_b64": body.annotation_iv_b64,
    }


@router.get("", response_model=list[SubmissionResponse])
async def list_submissions(
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
    include_scans: bool = Query(
        False,
        description=(
            "Include scan_ciphertext_b64/scan_iv_b64 for every submission. Off by "
            "default: the scan PDF is the bulk of a submission's payload, so an "
            "overview listing all of an exam's submissions must not ship every "
            "scan just to show a table. Use has_scan for a presence indicator, "
            "and GET /exams/{id}/submissions/{sub_id} to fetch one scan's bytes "
            "on demand."
        ),
    ),
) -> list[SubmissionResponse]:
    """List all non-deleted submissions for an exam."""
    result = await db.execute(
        select(ScanSubmission).where(
            ScanSubmission.exam_id == exam.id,
            ScanSubmission.deleted_at.is_(None),
        )
    )
    subs = result.scalars().all()
    scans = {s.id: await load_scan(db, s) for s in subs} if include_scans else {}
    return [
        _to_response(
            s,
            scan_ciphertext_b64=_b64(scans.get(s.id)),
            scan_iv_b64=_b64(s.scan_iv) if include_scans else None,
        )
        for s in subs
    ]


@router.post(
    "",
    response_model=SubmissionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_server_results_writable)],
)
async def upload_submission(
    body: SubmissionCreate,
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> SubmissionResponse:
    """Upload encrypted scan submission."""
    # Ensure the student identity exists first (foreign key). The FK spans (pseudonym_hmac, exam_id), so the identity is looked up within this exam only: a submission cannot link to another exam's (and tenant's) identity.
    student_res = await db.execute(
        select(StudentIdentity).where(
            StudentIdentity.pseudonym_hmac == body.pseudonym_hmac,
            StudentIdentity.exam_id == exam.id,
        )
    )
    existing_identity = student_res.scalar_one_or_none()
    if existing_identity is None:
        # In a savepoint: a parallel upload for the same new pseudonym may insert the placeholder first, and then this upload simply links to it (a 409 would make the queue drop it).
        try:
            async with db.begin_nested():
                db.add(
                    StudentIdentity(
                        pseudonym_hmac=body.pseudonym_hmac,
                        exam_id=exam.id,
                        pii_ciphertext=b"\x00",
                        iv=b"\x00" * 12,
                        encryption_salt=b"\x00" * 16,
                    )
                )
        except IntegrityError:
            pass
    elif existing_identity.deleted_at is not None:
        # Its erasure would cascade to this submission. It comes back as the placeholder, as if already erased: only a student upload brings deleted PII back.
        existing_identity.pii_ciphertext = b"\x00"
        existing_identity.iv = b"\x00" * 12
        existing_identity.encryption_salt = b"\x00" * 16
        existing_identity.deleted_at = None
        existing_identity.retention_until = None
        await db.flush()

    scan_bytes = (
        decode_b64(body.scan_ciphertext_b64, "scan_ciphertext_b64")
        if body.scan_ciphertext_b64
        else None
    )
    scan_iv = (
        decode_b64(body.scan_iv_b64, "scan_iv_b64", expected_len=GCM_IV_BYTES)
        if body.scan_iv_b64
        else b""
    )
    ann_bytes = (
        decode_b64(body.annotation_ciphertext_b64, "annotation_ciphertext_b64")
        if body.annotation_ciphertext_b64
        else None
    )
    ann_iv = (
        decode_b64(body.annotation_iv_b64, "annotation_iv_b64", expected_len=GCM_IV_BYTES)
        if body.annotation_iv_b64
        else None
    )

    # Handle submission upsert if ID already exists
    if body.id:
        sub_res = await db.execute(
            select(ScanSubmission).where(ScanSubmission.id == body.id)
        )
        existing_sub = sub_res.scalar_one_or_none()
        if existing_sub:
            if existing_sub.exam_id != exam.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Submission belongs to another exam.",
                )
            had_scan = has_scan(existing_sub)
            existing_sub.pseudonym_hmac = body.pseudonym_hmac
            # An upsert onto a soft-deleted submission makes it live again.
            existing_sub.deleted_at = None
            existing_sub.retention_until = None
            if body.total_score is not None:
                existing_sub.total_score = body.total_score
            if scan_bytes is not None:
                await store_scan(db, existing_sub, exam.id, existing_sub.id, scan_bytes)
                existing_sub.scan_iv = scan_iv
            if ann_bytes is not None:
                existing_sub.annotation_ciphertext = ann_bytes
                existing_sub.annotation_iv = ann_iv
            elif body.clear_annotations:
                existing_sub.annotation_ciphertext = None
                existing_sub.annotation_iv = None
            # An absent annotation field means "leave them"; deleting is explicit.
            await db.flush()
            return _to_response(
                existing_sub, **_echo(body), scan_present=had_scan or scan_bytes is not None
            )

    sub = ScanSubmission(
        id=body.id or uuid.uuid4(),
        exam_id=exam.id,
        pseudonym_hmac=body.pseudonym_hmac,
        total_score=body.total_score,
        scan_iv=scan_iv,
        annotation_ciphertext=ann_bytes,
        annotation_iv=ann_iv,
    )
    if scan_bytes is not None:
        await store_scan(db, sub, exam.id, sub.id, scan_bytes)
    db.add(sub)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise _upload_conflict() from None

    return _to_response(sub, **_echo(body), scan_present=scan_bytes is not None)


@router.get("/{sub_id}", response_model=SubmissionResponse)
async def get_submission(
    sub: ScanSubmission = Depends(_live_submission),
    db: AsyncSession = Depends(get_db),
) -> SubmissionResponse:
    """Download encrypted scan submission by ID."""
    return _to_response(
        sub,
        scan_ciphertext_b64=_b64(await load_scan(db, sub)),
        scan_iv_b64=base64.b64encode(sub.scan_iv).decode(),
    )


@router.patch(
    "/{sub_id}/score",
    response_model=SubmissionResponse,
    dependencies=[Depends(require_server_results_writable)],
)
async def update_score(
    body: SubmissionScoreUpdate,
    sub: ScanSubmission = Depends(_live_submission),
    db: AsyncSession = Depends(get_db),
) -> SubmissionResponse:
    """Update plaintext total score for server-side statistics."""
    sub.total_score = body.total_score
    await db.flush()
    return _to_response(sub)


@router.delete("/{sub_id}/grading", status_code=status.HTTP_204_NO_CONTENT)
async def clear_grading(
    sub: ScanSubmission = Depends(_live_submission),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Clear all grading data (score + annotations) for a submission."""
    sub.total_score = None
    sub.annotation_ciphertext = None
    sub.annotation_iv = None
    # Per-exercise scores are grading data too.
    await db.execute(delete(ExerciseScore).where(ExerciseScore.submission_id == sub.id))
    await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_submission(
    sub: ScanSubmission = Depends(_live_submission),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Soft-delete a scan submission by ID."""
    # Retention only erases soft-deleted rows that carry a deadline.
    sub.deleted_at = datetime.now(UTC)
    sub.retention_until = date.today() + timedelta(days=settings.RETENTION_GRACE_DAYS)
    await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

