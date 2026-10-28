"""FastAPI dependencies — auth + ownership verification."""
from __future__ import annotations

import uuid
from dataclasses import dataclass

import jwt
from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.exam import Exam
from app.models.exercise import Exercise
from app.models.scan_submission import ScanSubmission
from app.models.teacher import Teacher
from app.services import maintenance
from app.services.exercise_sharing import readable_clause
from app.services.jwt import decode_token


async def _decode_session(
    access_token: str | None, expected_account: str | None, db: AsyncSession
) -> tuple[Teacher, dict[str, object]]:
    """The approved account and claims of the access cookie (never an Authorization header), or 401.

    A tab that names the account it holds keys for (`X-Expected-Account`) gets 409 when the cookie
    now belongs to another one (S12): it must lock instead of writing into that account."""
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not access_token:
        raise credentials_exc
    try:
        payload = decode_token(access_token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    except jwt.InvalidTokenError:
        raise credentials_exc from None
    if payload.get("type") != "access":
        raise credentials_exc
    try:
        teacher_id = uuid.UUID(str(payload.get("sub") or ""))
    except ValueError:
        raise credentials_exc from None

    result = await db.execute(select(Teacher).where(Teacher.id == teacher_id))
    teacher = result.scalar_one_or_none()
    # A pending account never receives a token (auth.advance_sign_in); refusing one here too
    # keeps a token minted by any other path from reaching anything.
    if teacher is None or teacher.approved_at is None:
        raise credentials_exc
    if expected_account and expected_account != str(teacher.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This browser tab belongs to another account. Sign in again.",
            headers={"code": "ERR_ACCOUNT_MISMATCH"},
        )
    return teacher, payload


async def get_current_teacher(
    access_token: str | None = Cookie(default=None),
    x_expected_account: str | None = Header(default=None, include_in_schema=False),
    db: AsyncSession = Depends(get_db),
) -> Teacher:
    """The signed-in Teacher of a full session, else 401/403."""
    teacher, payload = await _decode_session(access_token, x_expected_account, db)
    # Everything outside the login and enrollment endpoints needs a session that
    # two distinct factors earned. A token minted halfway through a sign-in, or
    # for an account that has not finished enrolling, reaches nothing else.
    scope = payload.get("scope", "full")
    if scope != "full":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Finish setting up your sign-in factors."
                if scope == "enroll"
                else "Another sign-in factor is required."
            ),
            headers={
                "code": (
                    "ERR_MFA_ENROLLMENT_REQUIRED" if scope == "enroll" else "ERR_MFA_REQUIRED"
                )
            },
        )
    return teacher


@dataclass(frozen=True)
class PendingSession:
    """A sign-in in progress: who, how far along, and which token said so."""

    teacher: Teacher
    scope: str
    amr: list[str]
    jti: str | None


async def get_pending_teacher(
    access_token: str | None = Cookie(default=None),
    x_expected_account: str | None = Header(default=None, include_in_schema=False),
    db: AsyncSession = Depends(get_db),
) -> PendingSession:
    """Accept a half-finished sign-in (factor, enrollment and key-recovery endpoints only).

    Returns the account, token scope and factors already presented. The next factor is checked
    against the account named in the token, never an email the caller supplies."""
    teacher, payload = await _decode_session(access_token, x_expected_account, db)
    amr = payload.get("amr")
    jti = payload.get("jti")
    return PendingSession(
        teacher=teacher,
        scope=str(payload.get("scope", "full")),
        amr=[str(f) for f in amr] if isinstance(amr, list) else [],
        jti=str(jti) if jti else None,
    )


async def get_admin_teacher(
    teacher: Teacher = Depends(get_current_teacher),
) -> Teacher:
    """Require admin role."""
    if teacher.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required.")
    return teacher


async def get_teaching_teacher(
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> Teacher:
    """Require a teacher account: admins manage users and the server only (issue #58).

    Gates every endpoint that reads or writes exams, exercises, results or their settings.
    An admin's legacy data is kept but unreachable until `cli.py set-role` makes it a teacher."""
    if teacher.role != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin accounts manage users and the server; exams and exercises need a "
            "teacher account.",
            headers={"code": "ERR_TEACHER_ROLE_REQUIRED"},
        )
    # Maintenance (issue #130): teaching data stays still while it is backed up or migrated.
    await maintenance.ensure_teaching_allowed(db)
    return teacher


async def get_exam_for_teacher(
    exam_id: uuid.UUID,
    teacher: Teacher = Depends(get_teaching_teacher),
    db: AsyncSession = Depends(get_db),
) -> Exam:
    """
    Return the exam if it belongs to *teacher* and is not soft-deleted.

    Missing, foreign and deleted all answer the same 404, so existence never leaks. Not 401: the
    client would refresh the session, and a queued write for a deleted exam would retry forever.
    """
    result = await db.execute(
        select(Exam).where(
            Exam.id == exam_id,
            Exam.teacher_id == teacher.id,
            Exam.deleted_at.is_(None),
        )
    )
    exam = result.scalar_one_or_none()
    if exam is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exam not found.",
            headers={"code": "ERR_EXAM_NOT_FOUND"},
        )
    return exam


async def get_exercise_for_teacher(
    exercise_id: uuid.UUID,
    teacher: Teacher = Depends(get_teaching_teacher),
    db: AsyncSession = Depends(get_db),
) -> Exercise:
    """Return the exercise only if it belongs to *teacher*; use for every write path.

    Shared (`is_public`) exercises are never writable by non-owners. Raises 404, not 403, so a
    non-owner cannot tell "someone else's" from "does not exist"."""
    result = await db.execute(
        select(Exercise).where(
            Exercise.id == exercise_id,
            Exercise.teacher_id == teacher.id,
        )
    )
    exercise = result.scalar_one_or_none()
    if exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    return exercise


async def get_readable_exercise(
    exercise_id: uuid.UUID,
    teacher: Teacher = Depends(get_teaching_teacher),
    db: AsyncSession = Depends(get_db),
) -> Exercise:
    """Return the exercise if *teacher* owns it or it is shared with them (issue #65).

    Read-only counterpart to `get_exercise_for_teacher`; never use it to write or to link an
    exercise into an exam (a shared row is only ever copied)."""
    result = await db.execute(
        select(Exercise).where(Exercise.id == exercise_id, readable_clause(teacher))
    )
    exercise = result.scalar_one_or_none()
    if exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    return exercise


async def get_submission_for_teacher(
    submission_id: uuid.UUID,
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> ScanSubmission:
    """The live submission inside an exam the teacher owns (ownership via the exam)."""
    result = await db.execute(
        select(ScanSubmission).where(
            ScanSubmission.id == submission_id,
            ScanSubmission.exam_id == exam.id,
            ScanSubmission.deleted_at.is_(None),
        )
    )
    submission = result.scalar_one_or_none()
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")
    return submission


async def require_not_frozen(
    access_token: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Credential and account writes also stop while maintenance is down, so the maintenance
    backup stays consistent (issue #130). The role claim only exempts admins; auth stays below."""
    role = None
    if access_token:
        try:
            role = decode_token(access_token).get("role")
        except jwt.InvalidTokenError:
            role = None
    if role != "admin":
        await maintenance.ensure_teaching_allowed(db, code="ERR_MAINTENANCE_ACCOUNT_PAUSED")
