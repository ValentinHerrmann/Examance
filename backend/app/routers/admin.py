"""Admin router — /api/v1/admin/*"""
from __future__ import annotations

import math
import uuid
from datetime import UTC, datetime
from typing import Annotated, Any, Literal, cast

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from sqlalchemy import CursorResult, delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_admin_teacher
from app.models.allowed_email_domain import AllowedEmailDomain
from app.models.audit_log import AuditLog
from app.models.key_envelope import KeyEnvelope
from app.models.refresh_token import RefreshToken
from app.models.registration_request import RegistrationRequest
from app.models.scan_submission import ScanSubmission
from app.models.teacher import Teacher
from app.schemas.admin import (
    AccountFeatures,
    AccountFeaturesUpdate,
    AdminApproveRequest,
    AdminCreateUserRequest,
    AdminCreateUserResponse,
    AdminResetPasswordResponse,
    AdminUserList,
    AdminUserResponse,
    AllowedDomainRequest,
    AllowedDomainResponse,
    AuditLogResponse,
    ClassStatsResponse,
)
from app.services import account_mail, registration
from app.services import audit as audit_svc
from app.services import mfa as mfa_svc
from app.services import webauthn as webauthn_svc
from app.services.password_reset import create_and_send_reset_token

router = APIRouter(prefix="/admin", tags=["admin"])

# Minimum sample size for k-anonymity score statistics
K_ANONYMITY_THRESHOLD = 5


def _rowcount(result: Any) -> int:
    # DML results are CursorResults; `AsyncSession.execute` is typed as the base Result.
    return cast("CursorResult[Any]", result).rowcount


def _features(row: Teacher | AllowedEmailDomain) -> AccountFeatures:
    return AccountFeatures(
        server_results=row.allow_server_results, server_latex=row.allow_server_latex
    )


def _apply_features(row: Teacher | AllowedEmailDomain, features: AccountFeatures) -> None:
    row.allow_server_results = features.server_results
    row.allow_server_latex = features.server_latex


def _user_out(user: Teacher) -> AdminUserResponse:
    return AdminUserResponse(
        id=user.id,
        email=user.email,
        role=cast(Literal["teacher", "admin"], user.role),
        created_at=user.created_at,
        approved_at=user.approved_at,
        registration_note=user.registration_note,
        features=_features(user),
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


@router.get("/users", response_model=AdminUserList)
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
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminCreateUserResponse:
    """
    Invite a teacher/admin: create the account without a password (Admin only).

    The account is approved with the given features, and the address counts as verified: the
    mailed set-password link is the only way in, so using it proves the mailbox. A pending
    self-registration for the same address is superseded (its link stops working).
    """
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
    _apply_features(user, body.features)
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


@router.post("/users/{user_id}/approve", response_model=AdminUserResponse)
async def approve_user(
    user_id: uuid.UUID,
    body: AdminApproveRequest,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
    background_tasks: BackgroundTasks,
) -> AdminUserResponse:
    """
    Approve a pending registration with the given features (Admin only).

    Conditional on the account still being pending, so two admins approving at once send one
    mail. The registrant's note is erased: it only served this decision.
    """
    changed = await db.execute(
        update(Teacher)
        .where(Teacher.id == user_id, Teacher.approved_at.is_(None))
        .values(
            approved_at=datetime.now(UTC),
            registration_note=None,
            allow_server_results=body.features.server_results,
            allow_server_latex=body.features.server_latex,
        )
    )
    user = await _load_user(db, user_id)
    if _rowcount(changed) != 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account is already approved.",
            headers={"code": "ERR_ALREADY_APPROVED"},
        )

    await audit_svc.write(
        db,
        teacher_id=admin.id,
        teacher_email=admin.email,
        action="USER_APPROVED",
        target_id=str(user.id),
    )
    await db.commit()
    background_tasks.add_task(account_mail.send_all, [account_mail.approved_mail(user.email)])
    return _user_out(user)


@router.post("/users/{user_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
async def reject_user(
    user_id: uuid.UUID,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
    background_tasks: BackgroundTasks,
) -> Response:
    """
    Reject a pending registration: the account is deleted and the registrant told (Admin only).

    Only ever deletes an account that is still pending; an approved one is refused.
    """
    user = await _load_user(db, user_id)
    email = user.email
    removed = await db.execute(
        delete(Teacher).where(Teacher.id == user_id, Teacher.approved_at.is_(None))
    )
    if _rowcount(removed) != 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only an account waiting for approval can be rejected.",
            headers={"code": "ERR_ALREADY_APPROVED"},
        )

    await audit_svc.write(
        db,
        teacher_id=admin.id,
        teacher_email=admin.email,
        action="USER_REJECTED",
        target_id=str(user_id),
    )
    await db.commit()
    background_tasks.add_task(account_mail.send_all, [account_mail.rejected_mail(email)])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/users/{user_id}/features", response_model=AdminUserResponse)
async def update_user_features(
    user_id: uuid.UUID,
    body: AccountFeaturesUpdate,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminUserResponse:
    """
    Change an account's feature switches (Admin only).

    Revoking `server_results` from an account in "all-server" mode does not touch its data: the
    next time it opens, the app asks it to move its results into the browser.
    """
    user = await _load_user(db, user_id)
    if body.server_results is not None:
        user.allow_server_results = body.server_results
    if body.server_latex is not None:
        user.allow_server_latex = body.server_latex
    await audit_svc.write(
        db,
        teacher_id=admin.id,
        teacher_email=admin.email,
        action="USER_FEATURES_CHANGED",
        target_id=str(user.id),
    )
    await db.flush()
    return _user_out(user)


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_200_OK)
async def reset_user_password(
    user_id: uuid.UUID,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminResetPasswordResponse:
    """
    Trigger an admin-forced password reset for an existing user (Admin only).

    Generates and emails a single-use password reset token. The user's existing
    password remains active until they set a new password via the link. For an
    invited account that never set a password this resends the invitation.
    """
    result = await db.execute(select(Teacher).where(Teacher.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
    if user.approved_at is None:
        raise _pending_conflict()

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


def _domain_out(row: AllowedEmailDomain) -> AllowedDomainResponse:
    return AllowedDomainResponse(
        id=row.id, domain=row.domain, features=_features(row), created_at=row.created_at
    )


async def _load_domain(db: AsyncSession, domain_id: uuid.UUID) -> AllowedEmailDomain:
    row = await db.get(AllowedEmailDomain, domain_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found.")
    return row


@router.get("/allowed-domains", response_model=list[AllowedDomainResponse])
async def list_allowed_domains(
    _admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AllowedDomainResponse]:
    """Domains whose registrations are approved automatically (Admin only)."""
    rows = await db.scalars(select(AllowedEmailDomain).order_by(AllowedEmailDomain.domain))
    return [_domain_out(row) for row in rows]


@router.post(
    "/allowed-domains",
    response_model=AllowedDomainResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_allowed_domain(
    body: AllowedDomainRequest,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AllowedDomainResponse:
    """
    Approve every future registration from a domain automatically (Admin only).

    Exact match on the part after '@'; subdomains need their own entry. Existing accounts are
    not affected.
    """
    try:
        domain = registration.normalize_domain(body.domain)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter a domain such as school.example.",
            headers={"code": "ERR_INVALID_DOMAIN"},
        ) from None
    row = AllowedEmailDomain(domain=domain)
    _apply_features(row, body.features)
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This domain is already on the list.",
            headers={"code": "ERR_DOMAIN_EXISTS"},
        ) from None
    await db.refresh(row)
    await audit_svc.write(
        db,
        teacher_id=admin.id,
        teacher_email=admin.email,
        action="ALLOWED_DOMAIN_ADDED",
        target_id=domain,
    )
    return _domain_out(row)


@router.patch("/allowed-domains/{domain_id}", response_model=AllowedDomainResponse)
async def update_allowed_domain(
    domain_id: uuid.UUID,
    body: AccountFeaturesUpdate,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AllowedDomainResponse:
    """Change the features future registrations from a domain receive (Admin only)."""
    row = await _load_domain(db, domain_id)
    if body.server_results is not None:
        row.allow_server_results = body.server_results
    if body.server_latex is not None:
        row.allow_server_latex = body.server_latex
    await audit_svc.write(
        db,
        teacher_id=admin.id,
        teacher_email=admin.email,
        action="ALLOWED_DOMAIN_CHANGED",
        target_id=row.domain,
    )
    await db.flush()
    return _domain_out(row)


@router.delete("/allowed-domains/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_allowed_domain(
    domain_id: uuid.UUID,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Stop approving a domain automatically (Admin only). Existing accounts stay."""
    row = await _load_domain(db, domain_id)
    domain = row.domain
    await db.delete(row)
    await audit_svc.write(
        db,
        teacher_id=admin.id,
        teacher_email=admin.email,
        action="ALLOWED_DOMAIN_REMOVED",
        target_id=domain,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
