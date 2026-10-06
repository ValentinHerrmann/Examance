"""Deleting an account (GDPR Art. 17): by its holder (`DELETE /user/me`) or by an admin.

Student identities and submissions under the account's exams are soft-deleted with the standard
grace period first, matching `purge-server-student-data`; deleting the teacher row then cascades
to everything the account owns (exams, exercises, credentials, key envelopes, logos, tokens).

Audit rows are kept, with `teacher_id` nulled by the FK's ON DELETE SET NULL and the email
snapshot left in place: Art. 17(3)(b) permits retaining what is needed for a legal obligation,
and the trail exists to evidence lawful handling of student data. Those rows age out under
AUDIT_LOG_RETENTION_DAYS rather than living forever.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any, cast

from fastapi import HTTPException, status
from sqlalchemy import CursorResult, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.exam import Exam
from app.models.scan_submission import ScanSubmission
from app.models.student_identity import StudentIdentity
from app.models.teacher import Teacher
from app.services import audit as audit_svc


@dataclass(frozen=True)
class DeletionResult:
    purged_student_identities: int
    purged_submissions: int
    retention_until: date


def _rowcount(result: Any) -> int:
    return cast("CursorResult[Any]", result).rowcount


async def ensure_not_last_admin(db: AsyncSession, teacher: Teacher) -> None:
    """Refuse to delete the only remaining admin: nobody could approve accounts afterwards."""
    if teacher.role != "admin":
        return
    admins = await db.scalar(
        select(func.count()).select_from(Teacher).where(
            Teacher.role == "admin", Teacher.approved_at.isnot(None)
        )
    )
    if (admins or 0) <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The last admin account cannot be deleted.",
            headers={"code": "ERR_LAST_ADMIN"},
        )


async def delete_account(
    db: AsyncSession,
    teacher: Teacher,
    *,
    actor: Teacher,
    request_ip: str | None = None,
) -> DeletionResult:
    """
    Delete *teacher* and everything the account owns. *actor* is the account holder or an admin;
    the audit entry names who did it. The caller checks permission and `ensure_not_last_admin`.
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

    # Written before the row disappears; audit_svc snapshots the email.
    await audit_svc.write(
        db,
        teacher_id=actor.id,
        teacher_email=actor.email,
        action="DELETE",
        target_id=str(teacher.id),
        request_ip=request_ip,
    )
    await db.flush()

    await db.delete(teacher)
    await db.flush()

    return DeletionResult(
        purged_student_identities=purged_students,
        purged_submissions=purged_submissions,
        retention_until=retention_until,
    )
