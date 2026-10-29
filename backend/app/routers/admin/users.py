"""Admin: accounts, sign-in factor reset, audit log — /api/v1/admin/*"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal, cast

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import DB, AdminTeacher, get_admin_teacher
from app.models.audit_log import AuditLog
from app.models.key_envelope import KeyEnvelope
from app.models.refresh_token import RefreshToken
from app.models.registration_request import RegistrationRequest
from app.models.teacher import Teacher
from app.routers.admin.features import apply_features, features_of, patch_features
from app.schemas.admin import (
    AccountFeaturesUpdate,
    AdminApproveRequest,
    AdminCreateUserRequest,
    AdminCreateUserResponse,
    AdminResetPasswordResponse,
    AdminUserList,
    AdminUserResponse,
    AuditLogResponse,
)
from app.services import account_mail, registration
from app.services import audit as audit_svc
from app.services import mfa as mfa_svc
from app.services import webauthn as webauthn_svc
from app.services.account_deletion import delete_account, ensure_not_last_admin
from app.services.password_reset import create_and_send_reset_token
from app.services.tokens import rowcount

router = APIRouter()
# Registered after the allowed-domain routes: path order is registration order, and docs/openapi.json (diffed in CI) lists these two there.
security_router = APIRouter()


def _user_out(user: Teacher) -> AdminUserResponse:
    return AdminUserResponse(
        id=user.id,
        email=user.email,
        role=cast(Literal["teacher", "admin"], user.role),
        created_at=user.created_at,
        approved_at=user.approved_at,
        registration_note=user.registration_note,
        features=features_of(user),
        password_set=user.password_hash is not None,
    )


def _pending_conflict() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="This account is waiting for approval. Approve or reject the registration.",
        headers={"code": "ERR_ACCOUNT_PENDING"},
    )


async def _load_user(db: AsyncSession, user_id: uuid.UUID) -> Teacher:
    user = await db.get(Teacher, user_id, populate_existing=True)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user


@router.get("/users")
async def list_users(
    _admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: Annotated[
        Literal["all", "pending", "active"], Query(alias="status")
    ] = "all",
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AdminUserList:
    """Accounts, newest first (Admin only). `pending` = waiting for approval."""
    query = select(Teacher)
    if status_filter == "pending":
        query = query.where(Teacher.approved_at.is_(None))
    elif status_filter == "active":
        query = query.where(Teacher.approved_at.isnot(None))
    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = await db.scalars(
        query.order_by(Teacher.created_at.desc(), Teacher.email).offset(offset).limit(limit)
    )
    return AdminUserList(items=[_user_out(user) for user in rows], total=total)


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user(
    body: AdminCreateUserRequest,
    request: Request,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminCreateUserResponse:
    """Invite a teacher/admin: create the account without a password (Admin only). Approved with the given features; the address counts as verified because the mailed set-password link is the only way in. A pending self-registration for it is superseded."""
    normalized_email = registration.normalize_email(body.email)
    existing = await db.execute(
        select(Teacher).where(func.lower(Teacher.email) == normalized_email)
    )
    found = existing.scalar_one_or_none()
    if found is not None:
        if found.approved_at is None:
            raise _pending_conflict()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
            headers={"code": "ERR_ACCOUNT_EXISTS"},
        )

    await db.execute(
        delete(RegistrationRequest).where(RegistrationRequest.email == normalized_email)
    )
    user = Teacher(
        email=normalized_email,
        password_hash=None,
        role=body.role,
        approved_at=datetime.now(UTC),
    )
    apply_features(user, body.features)
    db.add(user)
    await db.flush()
    await db.refresh(user)

    _token, reset_sent = await create_and_send_reset_token(db, user)

    await audit_svc.log(
        db, request, admin, "CREATE_USER" if reset_sent else "CREATE_USER_EMAIL_FAILED", user.id
    )
    await db.flush()

    return AdminCreateUserResponse(
        id=user.id,
        email=user.email,
        role=cast(Literal["teacher", "admin"], user.role),
        created_at=user.created_at,
        password_reset_sent=reset_sent,
    )


@router.post("/users/{user_id}/approve")
async def approve_user(
    user_id: uuid.UUID,
    body: AdminApproveRequest,
    request: Request,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
    background_tasks: BackgroundTasks,
) -> AdminUserResponse:
    """Approve a pending registration with the given features (Admin only). Conditional on the account still being pending, so two admins approving at once send one mail. The registrant's note is erased: it only served this decision."""
    changed = await db.execute(
        update(Teacher)
        .where(Teacher.id == user_id, Teacher.approved_at.is_(None))
        .values(
            approved_at=datetime.now(UTC),
            registration_note=None,
            allow_server_results=body.features.server_results,
            allow_server_latex=body.features.server_latex,
            allow_exercise_sharing=body.features.exercise_sharing,
        )
    )
    user = await _load_user(db, user_id)
    if rowcount(changed) != 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account is already approved.",
            headers={"code": "ERR_ALREADY_APPROVED"},
        )

    await audit_svc.log(db, request, admin, "USER_APPROVED", user.id)
    await db.commit()
    background_tasks.add_task(account_mail.send_all, [account_mail.approved_mail(user.email)])
    return _user_out(user)


@router.post("/users/{user_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
async def reject_user(
    user_id: uuid.UUID,
    request: Request,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
    background_tasks: BackgroundTasks,
) -> Response:
    """Reject a pending registration: the account is deleted and the registrant told (Admin only). Only ever deletes an account that is still pending; an approved one is refused."""
    user = await _load_user(db, user_id)
    email = user.email
    removed = await db.execute(
        delete(Teacher).where(Teacher.id == user_id, Teacher.approved_at.is_(None))
    )
    if rowcount(removed) != 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only an account waiting for approval can be rejected.",
            headers={"code": "ERR_ALREADY_APPROVED"},
        )

    await audit_svc.log(db, request, admin, "USER_REJECTED", user_id)
    await db.commit()
    background_tasks.add_task(account_mail.send_all, [account_mail.rejected_mail(email)])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/users/{user_id}/features")
async def update_user_features(
    user_id: uuid.UUID,
    body: AccountFeaturesUpdate,
    request: Request,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminUserResponse:
    """Change an account's feature switches (Admin only). Revoking `server_results` from an account in "all-server" mode does not touch its data: the next time it opens, the app asks it to move its results into the browser."""
    user = await _load_user(db, user_id)
    patch_features(user, body)
    await audit_svc.log(db, request, admin, "USER_FEATURES_CHANGED", user.id)
    await db.flush()
    return _user_out(user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    request: Request,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
    keep_exercises: bool = False,
) -> Response:
    """Delete an approved account and everything it owns (Admin only). With `keep_exercises` its library exercises stay ownerless (`services/account_deletion.py`). Pending registrations go through `/reject`; admins delete their own account in settings."""
    user = await _load_user(db, user_id)
    if user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Delete your own account from the settings page.",
            headers={"code": "ERR_DELETE_SELF"},
        )
    if user.approved_at is None:
        raise _pending_conflict()
    await ensure_not_last_admin(db, user)
    await delete_account(
        db,
        user,
        actor=admin,
        keep_exercises=keep_exercises,
        request_ip=audit_svc.client_ip(request),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_200_OK)
async def reset_user_password(
    user_id: uuid.UUID,
    request: Request,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminResetPasswordResponse:
    """Trigger an admin-forced password reset for an existing user (Admin only). Emails a single-use reset token; the existing password stays active until the link is used. For an invited account that never set a password this resends the invitation."""
    user = await _load_user(db, user_id)
    if user.approved_at is None:
        raise _pending_conflict()

    _token, reset_sent = await create_and_send_reset_token(db, user)

    await audit_svc.log(
        db,
        request,
        admin,
        "PASSWORD_RESET_REQUESTED" if reset_sent else "PASSWORD_RESET_EMAIL_FAILED",
        user.id,
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


@security_router.post("/users/{user_id}/reset-factors", status_code=status.HTTP_200_OK)
async def reset_user_factors(
    user_id: uuid.UUID,
    request: Request,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """Clear a user's authenticator and passkeys (Admin only), the escape hatch for a lost factor. Does not restore data access: the server cannot read key copies, so the removed factors' wraps are gone; the recovery code stays the way back (else an admin could read the data)."""
    user = await _load_user(db, user_id)
    if user.approved_at is None:
        raise _pending_conflict()
    # Another admin's factors are reset only with the CLI: one admin must not take over another.
    if user.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An admin's sign-in factors can only be reset on the server (cli.py).",
            headers={"code": "ERR_ADMIN_FACTORS_PROTECTED"},
        )

    await mfa_svc.disable(db, user.id)
    for credential in await webauthn_svc.list_credentials(db, user.id):
        await db.delete(credential)

    # The passkey wraps those credentials held are now unusable, so they are dropped rather than left looking like available recovery paths.
    await db.execute(
        delete(KeyEnvelope).where(
            KeyEnvelope.teacher_id == user.id, KeyEnvelope.kind == "passkey"
        )
    )

    # Every live session was earned by a factor that no longer exists.
    await db.execute(
        update(RefreshToken).where(RefreshToken.teacher_id == user.id).values(revoked=True)
    )

    await audit_svc.log(db, request, admin, "MFA_DISABLED", user.id)

    return {
        "message": (
            f"Sign-in factors cleared for {user.email}. They must enrol a second factor "
            "on their next sign-in. Their encrypted data still needs their recovery code."
        )
    }


@security_router.get("/audit")
async def list_audit_logs(
    _admin: AdminTeacher,
    db: DB,
    limit: Annotated[int, Query(le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
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
