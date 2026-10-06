"""Deleting an account (GDPR Art. 17): by its holder or by an admin.

The holder asks in the settings (`POST /user/me/deletion-request`) and confirms through a mailed,
single-use link (`POST /auth/account-deletion/confirm`); opening the link alone deletes nothing,
so a mail scanner that fetches it is harmless. An admin deletes another account directly.

Either way the holder may keep their library exercises on the server (for sharing, which is
planned): they lose their owner (`teacher_id` NULL) and their group, and nobody sees them until
that feature decides. Exam-bound exercise copies (`exam_id` set) always go with their exams.

Student identities and submissions under the account's exams are soft-deleted with the standard
grace period first, matching `purge-server-student-data`; deleting the teacher row then cascades
to everything the account owns (exams, exercises, credentials, key envelopes, logos, tokens).

Audit rows are kept, with `teacher_id` nulled by the FK's ON DELETE SET NULL and the email
snapshot left in place: Art. 17(3)(b) permits retaining what is needed for a legal obligation,
and the trail exists to evidence lawful handling of student data. Those rows age out under
AUDIT_LOG_RETENTION_DAYS rather than living forever.
"""
from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any, cast

from fastapi import HTTPException, status
from sqlalchemy import CursorResult, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.account_deletion_request import AccountDeletionRequest
from app.models.exam import Exam
from app.models.exercise import Exercise
from app.models.scan_submission import ScanSubmission
from app.models.student_identity import StudentIdentity
from app.models.teacher import Teacher
from app.services import account_mail
from app.services import audit as audit_svc
from app.services.account_mail import Mail


@dataclass(frozen=True)
class DeletionResult:
    purged_student_identities: int
    purged_submissions: int
    retention_until: date


def _rowcount(result: Any) -> int:
    return cast("CursorResult[Any]", result).rowcount


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _aware(moment: datetime) -> datetime:
    # SQLite (tests) hands timestamps back without a zone; they were written in UTC.
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)


def _invalid_token() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="This deletion link is invalid or has expired.",
        headers={"code": "ERR_INVALID_DELETION_TOKEN"},
    )


async def create_deletion_request(
    db: AsyncSession, teacher: Teacher, *, keep_exercises: bool
) -> Mail:
    """Store a fresh single-use token for *teacher* (replacing an open one) and return its mail."""
    raw_token = secrets.token_urlsafe(32)
    await db.execute(
        delete(AccountDeletionRequest).where(AccountDeletionRequest.teacher_id == teacher.id)
    )
    db.add(
        AccountDeletionRequest(
            teacher_id=teacher.id,
            token_hash=_hash_token(raw_token),
            keep_exercises=keep_exercises,
            expires_at=datetime.now(UTC)
            + timedelta(minutes=settings.ACCOUNT_DELETION_TOKEN_TTL_MINUTES),
        )
    )
    await db.flush()
    link = account_mail.frontend_link(f"/delete-account?token={raw_token}")
    return account_mail.deletion_mail(teacher.email, link, keep_exercises=keep_exercises)


async def find_deletion_request(
    db: AsyncSession, raw_token: str
) -> tuple[AccountDeletionRequest, Teacher]:
    """The open request behind *raw_token* and its account. @raises 400 when unknown or expired."""
    request = await db.scalar(
        select(AccountDeletionRequest).where(
            AccountDeletionRequest.token_hash == _hash_token(raw_token)
        )
    )
    if request is None or _aware(request.expires_at) <= datetime.now(UTC):
        raise _invalid_token()
    teacher = await db.get(Teacher, request.teacher_id)
    if teacher is None:
        raise _invalid_token()
    return request, teacher


async def claim_deletion_request(
    db: AsyncSession, raw_token: str
) -> tuple[AccountDeletionRequest, Teacher]:
    """
    Like `find_deletion_request`, but removes the request so the link works once: two
    confirmations racing each other delete the account once, the second gets 400.
    """
    request, teacher = await find_deletion_request(db, raw_token)
    removed = await db.execute(
        delete(AccountDeletionRequest).where(AccountDeletionRequest.id == request.id)
    )
    if _rowcount(removed) != 1:
        raise _invalid_token()
    return request, teacher


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
    keep_exercises: bool = False,
    request_ip: str | None = None,
) -> DeletionResult:
    """
    Delete *teacher* and everything the account owns. *actor* is the account holder or an admin;
    the audit entry names who did it. The caller checks permission and `ensure_not_last_admin`.
    With *keep_exercises* the library exercises (every version, with their resources) stay
    without an owner instead.
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

    if keep_exercises:
        # Cut every link to the account first: the teacher FK cascades, and so would the
        # group's ORM delete-orphan.
        await db.execute(
            update(Exercise)
            .where(Exercise.teacher_id == teacher.id, Exercise.exam_id.is_(None))
            .values(teacher_id=None, exercise_group_id=None)
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
