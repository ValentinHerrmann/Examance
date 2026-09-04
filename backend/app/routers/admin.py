"""Admin router — /api/v1/admin/*"""
from __future__ import annotations

import math
import uuid
from typing import Annotated, Literal, cast

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_admin_teacher
from app.models.audit_log import AuditLog
from app.models.key_envelope import KeyEnvelope
from app.models.refresh_token import RefreshToken
from app.models.scan_submission import ScanSubmission
from app.models.teacher import Teacher
from app.schemas.admin import (
    AdminCreateUserRequest,
    AdminCreateUserResponse,
    AdminResetPasswordResponse,
    AuditLogResponse,
    ClassStatsResponse,
)
from app.services import audit as audit_svc
from app.services import mfa as mfa_svc
from app.services import webauthn as webauthn_svc
from app.services.password_reset import create_and_send_reset_token

router = APIRouter(prefix="/admin", tags=["admin"])

# Minimum sample size for k-anonymity score statistics
K_ANONYMITY_THRESHOLD = 5


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user(
    body: AdminCreateUserRequest,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminCreateUserResponse:
    """
    Create a teacher/admin account without a password (Admin only).

    Generates and emails a single-use password set token to the user.
    """
    normalized_email = body.email.strip().lower()
    existing = await db.execute(
        select(Teacher).where(func.lower(Teacher.email) == normalized_email)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    user = Teacher(
        email=normalized_email,
        password_hash=None,
        role=body.role,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    _token, reset_sent = await create_and_send_reset_token(db, user)

    await audit_svc.write(
        db,
        teacher_id=admin.id,
        teacher_email=admin.email,
        action="CREATE_USER" if reset_sent else "CREATE_USER_EMAIL_FAILED",
        target_id=str(user.id),
    )
    await db.flush()

    return AdminCreateUserResponse(
        id=user.id,
        email=user.email,
        role=cast(Literal["teacher", "admin"], user.role),
        created_at=user.created_at,
        password_reset_sent=reset_sent,
    )


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_200_OK)
async def reset_user_password(
    user_id: uuid.UUID,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminResetPasswordResponse:
    """
    Trigger an admin-forced password reset for an existing user (Admin only).

    Generates and emails a single-use password reset token. The user's existing
    password remains active until they set a new password via the link.
    """
    result = await db.execute(select(Teacher).where(Teacher.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    _token, reset_sent = await create_and_send_reset_token(db, user)

    await audit_svc.write(
        db,
        teacher_id=admin.id,
        teacher_email=admin.email,
        action="PASSWORD_RESET_REQUESTED" if reset_sent else "PASSWORD_RESET_EMAIL_FAILED",
        target_id=str(user.id),
    )

    if reset_sent:
        msg = f"Password reset link generated and sent to {user.email}."
    else:
        msg = f"Password reset token generated, but failed to send email to {user.email}."

    return AdminResetPasswordResponse(
        message=msg,
        user_id=user.id,
        password_reset_sent=reset_sent,
    )


@router.post("/users/{user_id}/reset-factors", status_code=status.HTTP_200_OK)
async def reset_user_factors(
    user_id: uuid.UUID,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """
    Clear a user's authenticator and passkeys (Admin only).

    The escape hatch for a teacher who has lost a factor and cannot get back in.
    Every sign-in needs two of three factors, and a teacher with exactly two who
    loses one has no path back on their own — backup codes only cover the
    authenticator.

    What this does **not** do is restore access to their data. Their key copies
    are untouched, because the server cannot read them: the wraps for the
    factors removed here are gone with those factors, and the recovery code
    remains the way back to the exams themselves. An administrator who could
    undo that could also read the data.
    """
    result = await db.execute(select(Teacher).where(Teacher.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    await mfa_svc.disable(db, user.id)
    for credential in await webauthn_svc.list_credentials(db, user.id):
        await db.delete(credential)

    # The passkey wraps those credentials held are now unusable, so they are
    # dropped rather than left looking like available recovery paths.
    await db.execute(
        delete(KeyEnvelope).where(
            KeyEnvelope.teacher_id == user.id, KeyEnvelope.kind == "passkey"
        )
    )

    # Every live session was earned by a factor that no longer exists.
    await db.execute(
        update(RefreshToken).where(RefreshToken.teacher_id == user.id).values(revoked=True)
    )

    await audit_svc.write(
        db,
        teacher_id=admin.id,
        teacher_email=admin.email,
        action="MFA_DISABLED",
        target_id=str(user.id),
    )

    return {
        "message": (
            f"Sign-in factors cleared for {user.email}. They must enrol a second factor "
            "on their next sign-in. Their encrypted data still needs their recovery code."
        )
    }


@router.get("/stats/{exam_id}", response_model=ClassStatsResponse)
async def get_exam_stats(
    exam_id: uuid.UUID,
    _admin: Teacher = Depends(get_admin_teacher),
    db: AsyncSession = Depends(get_db),
) -> ClassStatsResponse:
    """
    Get class statistics for an exam with server-side k≥5 anonymity enforcement.

    If count < 5, score details (mean, std_dev) are suppressed to protect privacy.
    """
    result = await db.execute(
        select(ScanSubmission.total_score).where(
            ScanSubmission.exam_id == exam_id,
            ScanSubmission.total_score.is_not(None),
            ScanSubmission.deleted_at.is_(None),
        )
    )
    scores = [r for r in result.scalars().all() if r is not None]
    count = len(scores)

    if count < K_ANONYMITY_THRESHOLD:
        return ClassStatsResponse(
            exam_id=exam_id,
            total_submissions=count,
            mean_score=None,
            std_dev=None,
            k_anonymity_satisfied=False,
            suppressed_reason=(
                f"Class statistics suppressed: sample size ({count}) is less "
                f"than k={K_ANONYMITY_THRESHOLD} threshold."
            ),
        )

    mean = sum(scores) / count
    variance = sum((x - mean) ** 2 for x in scores) / count
    std_dev = math.sqrt(variance)

    return ClassStatsResponse(
        exam_id=exam_id,
        total_submissions=count,
        mean_score=round(mean, 2),
        std_dev=round(std_dev, 2),
        k_anonymity_satisfied=True,
    )


@router.get("/audit", response_model=list[AuditLogResponse])
async def list_audit_logs(
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    _admin: Teacher = Depends(get_admin_teacher),
    db: AsyncSession = Depends(get_db),
) -> list[AuditLogResponse]:
    """Get paginated audit logs (Admin only)."""
    result = await db.execute(
        select(AuditLog).order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)
    )
    logs = result.scalars().all()
    return [
        AuditLogResponse(
            id=log.id,
            teacher_id=log.teacher_id,
            teacher_email=log.teacher_email,
            action=log.action,
            target_hash=log.target_hash,
            ip_hash=log.ip_hash,
            created_at=log.created_at,
        )
        for log in logs
    ]
