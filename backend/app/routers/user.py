"""User management router — /api/v1/user for storage policy actions (purge/restore)."""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any, cast

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import Result, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_teacher
from app.models.audit_log import AuditLog
from app.models.exam import Exam
from app.models.scan_submission import ScanSubmission
from app.models.student_identity import StudentIdentity
from app.models.teacher import Teacher
from app.services import audit as audit_svc

router = APIRouter(prefix="/user", tags=["user"])


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

    LaTeX exercise templates and exam structures remain intact.
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


@router.post("/restore-server-data", status_code=status.HTTP_200_OK)
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
            }
            for exam in exams_res.scalars().all()
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
