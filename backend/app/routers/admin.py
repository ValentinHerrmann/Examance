"""Admin router — /api/v1/admin/*"""
from __future__ import annotations

import math
import uuid
from typing import Annotated, Literal, cast

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_admin_teacher
from app.models.audit_log import AuditLog
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

    await create_and_send_reset_token(db, user)

    await audit_svc.write(
        db,
        teacher_id=admin.id,
        teacher_email=admin.email,
        action="CREATE_USER",
        target_id=str(user.id),
    )
    await db.flush()

    return AdminCreateUserResponse(
        id=user.id,
        email=user.email,
        role=cast(Literal["teacher", "admin"], user.role),
        created_at=user.created_at,
        password_reset_sent=True,
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

    await create_and_send_reset_token(db, user)

    await audit_svc.write(
        db,
        teacher_id=admin.id,
        teacher_email=admin.email,
        action="PASSWORD_RESET_REQUESTED",
        target_id=str(user.id),
    )

    return AdminResetPasswordResponse(
        message=f"Password reset link generated and sent to {user.email}.",
        user_id=user.id,
        password_reset_sent=True,
    )


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
