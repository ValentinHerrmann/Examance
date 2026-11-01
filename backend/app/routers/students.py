"""Students router — /api/v1/exams/{id}/students"""
from __future__ import annotations

import base64
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_exam_for_teacher, get_teaching_teacher
from app.models.exam import Exam
from app.models.scan_submission import ScanSubmission
from app.models.student_identity import StudentIdentity
from app.models.teacher import Teacher
from app.schemas.binary import ARGON2_SALT_BYTES, GCM_IV_BYTES, decode_b64
from app.schemas.student import StudentIdentityCreate, StudentIdentityResponse
from app.services import audit as audit_svc
from app.services import scan_storage, trash
from app.services.capabilities import require_server_results_writable
from app.services.pseudonyms import require_pseudonym_version

router = APIRouter(
    prefix="/exams/{exam_id}/students",
    tags=["students"],
    dependencies=[Depends(get_teaching_teacher)],
)


@router.post(
    "",
    response_model=StudentIdentityResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_server_results_writable)],
)
async def upload_student_identity(
    body: StudentIdentityCreate,
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> StudentIdentityResponse:
    """Upload encrypted student identity ciphertext. Handles upsert for duplicate pseudonym_hmac."""
    await require_pseudonym_version(db, exam.id, body.pseudonym_version)
    pii_bytes = decode_b64(body.pii_ciphertext_b64, "pii_ciphertext_b64")
    iv_bytes = decode_b64(body.iv_b64, "iv_b64", expected_len=GCM_IV_BYTES)
    salt_bytes = decode_b64(
        body.encryption_salt_b64, "encryption_salt_b64", expected_len=ARGON2_SALT_BYTES
    )

    # Check if this exam already holds the identity. Identities are keyed by (pseudonym_hmac, exam_id), so the same hmac under a different exam is a different identity and must not be matched here.
    result = await db.execute(
        select(StudentIdentity).where(
            StudentIdentity.pseudonym_hmac == body.pseudonym_hmac,
            StudentIdentity.exam_id == exam.id,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.pii_ciphertext = pii_bytes
        existing.iv = iv_bytes
        existing.encryption_salt = salt_bytes
        # An upload onto a soft-deleted identity makes it live again, or retention would erase it.
        existing.deleted_at = None
        existing.retention_until = None
        await db.flush()
        return StudentIdentityResponse(
            pseudonym_hmac=existing.pseudonym_hmac,
            exam_id=existing.exam_id,
            pii_ciphertext_b64=body.pii_ciphertext_b64,
            iv_b64=body.iv_b64,
            encryption_salt_b64=body.encryption_salt_b64,
            pseudonym_version=exam.pseudonym_version,
        )

    identity = StudentIdentity(
        pseudonym_hmac=body.pseudonym_hmac,
        exam_id=exam.id,
        pii_ciphertext=pii_bytes,
        iv=iv_bytes,
        encryption_salt=salt_bytes,
    )
    db.add(identity)
    await db.flush()

    return StudentIdentityResponse(
        pseudonym_hmac=identity.pseudonym_hmac,
        exam_id=identity.exam_id,
        pii_ciphertext_b64=body.pii_ciphertext_b64,
        iv_b64=body.iv_b64,
        encryption_salt_b64=body.encryption_salt_b64,
        pseudonym_version=exam.pseudonym_version,
    )


@router.delete("/{pseudonym_hmac}", status_code=status.HTTP_204_NO_CONTENT)
async def erase_student_identity(
    pseudonym_hmac: str,
    request: Request,
    trash_scope: trash.Trash,
    exam: Exam = Depends(get_exam_for_teacher),
    teacher: Teacher = Depends(get_teaching_teacher),
    db: AsyncSession = Depends(get_db),
    permanent: Annotated[
        bool, Query(description="GDPR Art. 17 erasure: skip the trash, drop the scan files.")
    ] = False,
) -> None:
    """Delete a student identity with their submissions and scores. Unless *permanent*, the trash keeps a copy (and the scan files) for RETENTION_GRACE_DAYS (issue #125); *permanent* is the GDPR erasure and is audited."""
    result = await db.execute(
        select(StudentIdentity).where(
            StudentIdentity.pseudonym_hmac == pseudonym_hmac,
            StudentIdentity.exam_id == exam.id,
        )
    )
    identity = result.scalar_one_or_none()
    if identity is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student identity not found."
        )

    snap = await trash.snapshot_student(db, exam, pseudonym_hmac)
    if permanent:
        # Every submission of this pseudonym, soft-deleted ones included: their scan files go too.
        submissions = (
            await db.execute(
                select(ScanSubmission).where(
                    ScanSubmission.pseudonym_hmac == pseudonym_hmac,
                    ScanSubmission.exam_id == exam.id,
                )
            )
        ).scalars().all()
        scan_storage.forget_scans(db, submissions)
        # Art. 17 covers copies too: earlier trash entries of this student go now.
        await trash.purge_student(db, teacher, exam.id, pseudonym_hmac)
        await audit_svc.log(db, request, teacher, "DELETE", pseudonym_hmac)
    else:
        await trash_scope.capture(
            db,
            "student",
            snap,
            label=await trash.result_label(db, exam, pseudonym_hmac),
            exam_id=exam.id,
        )
    await snap.delete(db)


@router.get("", response_model=list[StudentIdentityResponse])
async def list_student_identities(
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> list[StudentIdentityResponse]:
    """List the exam's encrypted student identities that are not soft-deleted."""
    result = await db.execute(
        select(StudentIdentity).where(
            StudentIdentity.exam_id == exam.id, StudentIdentity.deleted_at.is_(None)
        )
    )
    identities = result.scalars().all()
    return [
        StudentIdentityResponse(
            pseudonym_hmac=st.pseudonym_hmac,
            exam_id=st.exam_id,
            pii_ciphertext_b64=base64.b64encode(st.pii_ciphertext).decode(),
            iv_b64=base64.b64encode(st.iv).decode(),
            encryption_salt_b64=base64.b64encode(st.encryption_salt).decode(),
            pseudonym_version=exam.pseudonym_version,
        )
        for st in identities
    ]
