"""Deleting an account (GDPR Art. 17) by its holder (mailed single-use link) or an admin.

Flow: docs/account_creation_and_management.md. Students are soft-deleted first (grace period);
audit rows stay (Art. 17(3)(b)) until AUDIT_LOG_RETENTION_DAYS; kept exercises have no owner."""
from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import delete, select, update
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
from app.services.tokens import aware, hash_token, rowcount


@dataclass(frozen=True)
class DeletionResult:
    purged_student_identities: int
    purged_submissions: int
    retention_until: date


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
            token_hash=hash_token(raw_token),
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
            AccountDeletionRequest.token_hash == hash_token(raw_token)
        )
    )
    if request is None or aware(request.expires_at) <= datetime.now(UTC):
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
    if rowcount(removed) != 1:
        raise _invalid_token()
    return request, teacher


async def ensure_not_last_admin(db: AsyncSession, teacher: Teacher) -> None:
    """Refuse to delete the only remaining admin: nobody could approve accounts afterwards."""
    if teacher.role != "admin":
        return
    # Locks the admin rows, so two admins deleting each other at once cannot both pass.
    admins = (
        await db.scalars(
            select(Teacher.id)
            .where(Teacher.role == "admin", Teacher.approved_at.isnot(None))
            .with_for_update()
        )
    ).all()
    if len(admins) <= 1:
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
    """Delete *teacher* and everything the account owns; *actor* (holder or admin) is audited.

    The caller checks permission and `ensure_not_last_admin`. With *keep_exercises* the library
    exercises (every version, with resources) stay without an owner instead."""
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
        purged_students = rowcount(students_res)
        submissions_res = await db.execute(
            update(ScanSubmission)
            .where(
                ScanSubmission.exam_id.in_(exam_ids),
                ScanSubmission.deleted_at.is_(None),
            )
            .values(deleted_at=now, retention_until=retention_until)
        )
        purged_submissions = rowcount(submissions_res)

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
            .values(teacher_id=None, exercise_group_id=None, is_public=False, shared_at=None)
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
