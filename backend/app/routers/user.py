"""User management router — /api/v1/user for storage policy actions (purge/restore)."""
from __future__ import annotations

import base64
from datetime import UTC, date, datetime, timedelta
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import Result, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_teacher
from app.models.audit_log import AuditLog
from app.models.exam import Exam
from app.models.logo import ExamLogo
from app.models.scan_submission import ScanSubmission
from app.models.student_identity import StudentIdentity
from app.models.teacher import Teacher
from app.schemas.capabilities import CapabilitiesOut, StorageModeUpdate
from app.services import audit as audit_svc
from app.services.capabilities import (
    account_features,
    capabilities_for,
    require_server_results_writable,
)
from app.services.logo import get_teacher_logo

router = APIRouter(prefix="/user", tags=["user"])


def _capabilities_out(teacher: Teacher) -> CapabilitiesOut:
    caps = capabilities_for(teacher)
    return CapabilitiesOut(
        storage_mode=teacher.storage_mode,  # type: ignore[arg-type]  # constrained by ck_teachers_storage_mode
        allowed_storage_modes=list(caps.allowed_storage_modes),  # type: ignore[arg-type]
        features=caps.features,
    )


@router.get("/capabilities", response_model=CapabilitiesOut)
async def get_capabilities(teacher: Teacher = Depends(get_current_teacher)) -> CapabilitiesOut:
    """The account's storage mode (null until chosen) and what it may use."""
    return _capabilities_out(teacher)


@router.put("/storage-mode", response_model=CapabilitiesOut)
async def set_storage_mode(
    body: StorageModeUpdate,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> CapabilitiesOut:
    """
    Records the account's storage mode, compare-and-set on `expected`. Moving the results
    between server and browser is the client's job and happens before this call; this only
    states where they now live.
    """
    if body.mode not in capabilities_for(teacher).allowed_storage_modes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This storage mode is not enabled for your account.",
            headers={"code": "ERR_STORAGE_MODE_NOT_ALLOWED"},
        )
    if teacher.storage_mode != body.expected:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The storage mode was changed elsewhere.",
            headers={"code": "ERR_STORAGE_MODE_CHANGED"},
        )
    teacher.storage_mode = body.mode
    await db.flush()
    return _capabilities_out(teacher)


def _rowcount(result: Result[Any]) -> int:
    """
    Read the affected-row count off a DML result.

    `AsyncSession.execute` is typed as returning `Result`, but a DML statement
    always yields a `CursorResult`, which is where `rowcount` lives. The cast
    keeps that narrowing in one place instead of at every call site.
    """
    return cast("CursorResult[Any]", result).rowcount



@router.post("/purge-server-student-data", status_code=status.HTTP_200_OK)
async def purge_server_student_data(
    request: Request,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Soft-delete all student identities and scan submissions belonging to the current teacher
    with a 7-day retention grace period before hard deletion.

    LaTeX exercise templates and exam structures remain intact — including the
    resource files attached to exercises, which are teacher-authored content,
    not student data. A file that does contain personal data (e.g. a photo of a
    pupil) has to be deleted with the exercise or the file itself.
    """
    now = datetime.now(UTC)
    retention_until = date.today() + timedelta(days=settings.RETENTION_GRACE_DAYS)

    # Get all exam IDs belonging to this teacher
    exam_ids_result = await db.execute(
        select(Exam.id).where(Exam.teacher_id == teacher.id)
    )
    exam_ids = exam_ids_result.scalars().all()

    if not exam_ids:
        return {
            "status": "ok",
            "purged_student_identities": 0,
            "purged_submissions": 0,
            "retention_until": retention_until.isoformat(),
        }

    # Soft-delete student identities
    students_update = (
        update(StudentIdentity)
        .where(
            StudentIdentity.exam_id.in_(exam_ids),
            StudentIdentity.deleted_at.is_(None),
        )
        .values(deleted_at=now, retention_until=retention_until)
    )
    students_res = await db.execute(students_update)
    purged_students_count = _rowcount(students_res)

    # Soft-delete scan submissions
    submissions_update = (
        update(ScanSubmission)
        .where(
            ScanSubmission.exam_id.in_(exam_ids),
            ScanSubmission.deleted_at.is_(None),
        )
        .values(deleted_at=now, retention_until=retention_until)
    )
    submissions_res = await db.execute(submissions_update)
    purged_submissions_count = _rowcount(submissions_res)

    # Audit log
    await audit_svc.write(
        db,
        teacher_id=teacher.id,
        teacher_email=teacher.email,
        action="DELETE",
        target_id=str(teacher.id),
        request_ip=request.client.host if request.client else None,
    )

    return {
        "status": "ok",
        "purged_student_identities": purged_students_count,
        "purged_submissions": purged_submissions_count,
        "retention_until": retention_until.isoformat(),
    }


@router.post(
    "/restore-server-data",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_server_results_writable)],
)
async def restore_server_data(
    request: Request,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Restore soft-deleted student identities and scan submissions for the current teacher
    if they are within the 7-day retention grace period.
    """
    today = date.today()

    exam_ids_result = await db.execute(
        select(Exam.id).where(Exam.teacher_id == teacher.id)
    )
    exam_ids = exam_ids_result.scalars().all()

    if not exam_ids:
        return {
            "status": "ok",
            "restored_student_identities": 0,
            "restored_submissions": 0,
        }

    # Restore student identities
    students_update = (
        update(StudentIdentity)
        .where(
            StudentIdentity.exam_id.in_(exam_ids),
            StudentIdentity.deleted_at.isnot(None),
            StudentIdentity.retention_until >= today,
        )
        .values(deleted_at=None, retention_until=None)
    )
    students_res = await db.execute(students_update)
    restored_students_count = _rowcount(students_res)

    # Restore scan submissions
    submissions_update = (
        update(ScanSubmission)
        .where(
            ScanSubmission.exam_id.in_(exam_ids),
            ScanSubmission.deleted_at.isnot(None),
            ScanSubmission.retention_until >= today,
        )
        .values(deleted_at=None, retention_until=None)
    )
    submissions_res = await db.execute(submissions_update)
    restored_submissions_count = _rowcount(submissions_res)

    # Audit log
    await audit_svc.write(
        db,
        teacher_id=teacher.id,
        teacher_email=teacher.email,
        action="EXTEND_RETENTION",
        target_id=str(teacher.id),
        request_ip=request.client.host if request.client else None,
    )

    return {
        "status": "ok",
        "restored_student_identities": restored_students_count,
        "restored_submissions": restored_submissions_count,
    }


def _logo_export(mime_type: str | None, content: bytes | None) -> dict[str, Any] | None:
    if not content:
        return None
    return {
        "mime_type": mime_type,
        "byte_size": len(content),
        "content_b64": base64.b64encode(content).decode("ascii"),
    }


def _exam_logo_export(row: ExamLogo | None) -> dict[str, Any]:
    if row is None:
        return {"mode": "account"}
    return {"mode": row.mode, "file": _logo_export(row.mime_type, row.content)}


@router.get("/me/export", status_code=status.HTTP_200_OK)
async def export_own_data(
    request: Request,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    GDPR Art. 15/20 — machine-readable copy of the account holder's own data.

    Covers only what the server holds *about the teacher*: account fields, the
    exams they authored, and their audit trail. Student payloads are deliberately
    excluded — they are encrypted with a key the server never has, and they are
    not the teacher's personal data. Use the client-side per-student export for
    a student's Art. 15 request.
    """
    exams_res = await db.execute(
        select(Exam).where(Exam.teacher_id == teacher.id).order_by(Exam.created_at.asc())
    )
    exams = list(exams_res.scalars().all())
    logo = await get_teacher_logo(teacher.id, db)
    exam_logos = {
        row.exam_id: row
        for row in (
            await db.execute(
                select(ExamLogo).where(ExamLogo.exam_id.in_([e.id for e in exams]))
            )
        ).scalars()
    }
    audit_res = await db.execute(
        select(AuditLog)
        .where(AuditLog.teacher_id == teacher.id)
        .order_by(AuditLog.created_at.asc())
    )

    await audit_svc.write(
        db,
        teacher_id=teacher.id,
        teacher_email=teacher.email,
        action="EXPORT",
        target_id=str(teacher.id),
        request_ip=request.client.host if request.client else None,
    )

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "account": {
            "id": str(teacher.id),
            "email": teacher.email,
            "role": teacher.role,
            "created_at": teacher.created_at.isoformat() if teacher.created_at else None,
            "approved_at": teacher.approved_at.isoformat() if teacher.approved_at else None,
            "registration_note": teacher.registration_note,
            "storage_mode": teacher.storage_mode,
            "features": account_features(teacher),
            # The logo is printed on the exams, so the export carries the file itself.
            # "default" prints the bundled default logo, which is not the teacher's data.
            "exam_logo": (
                {"mode": "default"}
                if logo is None
                else {"mode": logo.mode, "file": _logo_export(logo.mime_type, logo.content)}
            ),
        },
        "exams": [
            {
                "id": str(exam.id),
                "title": exam.title,
                "grade": exam.grade,
                "klasse": exam.klasse,
                "fach": exam.fach,
                "datum": exam.datum,
                "created_at": exam.created_at.isoformat() if exam.created_at else None,
                "retention_until": exam.retention_until.isoformat(),
                "deleted_at": exam.deleted_at.isoformat() if exam.deleted_at else None,
                # "account": prints the account's exam_logo; "none": no logo; "custom": own file.
                "logo": _exam_logo_export(exam_logos.get(exam.id)),
            }
            for exam in exams
        ],
        "audit_log": [
            {
                "action": entry.action,
                "target_hash": entry.target_hash,
                "created_at": entry.created_at.isoformat(),
            }
            for entry in audit_res.scalars().all()
        ],
    }


@router.delete("/me", status_code=status.HTTP_200_OK)
async def delete_own_account(
    request: Request,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    GDPR Art. 17 — erase the account holder's own account and authored content.

    Student identities and submissions under the teacher's exams are soft-deleted
    with the standard grace period and erased by the retention job, matching
    `purge-server-student-data`.

    Audit rows are kept, with `teacher_id` nulled by the FK's ON DELETE SET NULL
    and the email snapshot left in place: Art. 17(3)(b) permits retaining what is
    needed for a legal obligation, and the trail exists to evidence lawful
    handling of student data. Those rows age out under AUDIT_LOG_RETENTION_DAYS
    rather than living forever.
    """
    now = datetime.now(UTC)
    retention_until = date.today() + timedelta(days=settings.RETENTION_GRACE_DAYS)

    exam_ids = (
        await db.execute(select(Exam.id).where(Exam.teacher_id == teacher.id))
    ).scalars().all()

    purged_students = 0
    purged_submissions = 0
    if exam_ids:
        students_res = await db.execute(
            update(StudentIdentity)
            .where(
                StudentIdentity.exam_id.in_(exam_ids),
                StudentIdentity.deleted_at.is_(None),
            )
            .values(deleted_at=now, retention_until=retention_until)
        )
        purged_students = _rowcount(students_res)
        submissions_res = await db.execute(
            update(ScanSubmission)
            .where(
                ScanSubmission.exam_id.in_(exam_ids),
                ScanSubmission.deleted_at.is_(None),
            )
            .values(deleted_at=now, retention_until=retention_until)
        )
        purged_submissions = _rowcount(submissions_res)

        await db.execute(
            update(Exam)
            .where(Exam.teacher_id == teacher.id, Exam.deleted_at.is_(None))
            .values(deleted_at=now, retention_until=retention_until)
        )

    # Written before the row disappears — audit_svc snapshots the email.
    await audit_svc.write(
        db,
        teacher_id=teacher.id,
        teacher_email=teacher.email,
        action="DELETE",
        target_id=str(teacher.id),
        request_ip=request.client.host if request.client else None,
    )
    await db.flush()

    await db.delete(teacher)

    return {
        "status": "ok",
        "account_deleted": True,
        "purged_student_identities": purged_students,
        "purged_submissions": purged_submissions,
        "retention_until": retention_until.isoformat(),
    }
