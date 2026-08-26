"""
MFA enrollment — /api/v1/mfa/*

Reachable from a half-finished sign-in as well as a full session: an account
that has not yet enrolled two factors holds an ``enroll``-scoped token and can
reach nothing else, so enrollment has to work from there or the account would be
stuck.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import PendingSession, get_pending_teacher
from app.middleware.rate_limit import limiter
from app.schemas.mfa import (
    MfaBackupCodesResponse,
    MfaEnrollResponse,
    MfaStatusResponse,
    TotpConfirmRequest,
)
from app.services import audit as audit_svc
from app.services import auth_policy
from app.services import mfa as mfa_svc

router = APIRouter(prefix="/mfa", tags=["mfa"])

_ENROLL_SCOPES = {"full", "enroll", "auth_pending"}


def _require_enrollment_scope(session: PendingSession) -> None:
    if session.scope not in _ENROLL_SCOPES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authenticated for enrollment.",
            headers={"code": "ERR_UNAUTHORIZED"},
        )


@router.get("/status", response_model=MfaStatusResponse)
async def mfa_status(
    session: PendingSession = Depends(get_pending_teacher),
    db: AsyncSession = Depends(get_db),
) -> MfaStatusResponse:
    """What this account has enrolled, and whether that is enough to sign in."""
    _require_enrollment_scope(session)
    teacher = session.teacher
    enrolled = await auth_policy.enrolled_factors(db, teacher)
    capable = await auth_policy.key_capable_factors(db, teacher)
    return MfaStatusResponse(
        enrolled=sorted(enrolled),
        key_capable=sorted(capable),
        required_factor_count=auth_policy.REQUIRED_FACTOR_COUNT,
        complete=len(enrolled) >= auth_policy.REQUIRED_FACTOR_COUNT,
        remaining_backup_codes=await mfa_svc.remaining_backup_codes(db, teacher.id),
    )


@router.post("/totp/enroll", response_model=MfaEnrollResponse)
@limiter.limit("10/hour")
async def enroll_totp(
    request: Request,
    session: PendingSession = Depends(get_pending_teacher),
    db: AsyncSession = Depends(get_db),
) -> MfaEnrollResponse:
    """
    Start an authenticator enrollment.

    The secret is returned exactly once, inside the `otpauth://` URI. It is not
    retrievable afterwards: a teacher who loses the enrollment mid-setup starts
    over, which costs a minute, whereas an endpoint that hands back an existing
    secret would let anyone holding a session clone the second factor.
    """
    _require_enrollment_scope(session)
    try:
        uri = await mfa_svc.start_enrollment(db, session.teacher)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
            headers={"code": "ERR_BAD_REQUEST"},
        ) from None
    return MfaEnrollResponse(otpauth_uri=uri)


@router.post("/totp/confirm", response_model=MfaBackupCodesResponse)
@limiter.limit("20/hour")
async def confirm_totp(
    body: TotpConfirmRequest,
    request: Request,
    session: PendingSession = Depends(get_pending_teacher),
    db: AsyncSession = Depends(get_db),
) -> MfaBackupCodesResponse:
    """
    Prove the authenticator works, which is what makes it count as a factor.

    Returns the backup codes once. They are the way back when the phone is lost,
    and they stand in for this factor rather than adding a third.
    """
    _require_enrollment_scope(session)
    teacher = session.teacher

    if not await mfa_svc.confirm_enrollment(db, teacher, body.code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication code.",
            headers={"code": "ERR_MFA_INVALID_CODE"},
        )

    codes = await mfa_svc.issue_backup_codes(db, teacher)
    await audit_svc.write(
        db,
        teacher_id=teacher.id,
        teacher_email=teacher.email,
        action="MFA_ENROLLED",
        request_ip=request.client.host if request.client else None,
    )
    return MfaBackupCodesResponse(backup_codes=codes)


@router.post("/backup-codes/regenerate", response_model=MfaBackupCodesResponse)
@limiter.limit("10/hour")
async def regenerate_backup_codes(
    request: Request,
    session: PendingSession = Depends(get_pending_teacher),
    db: AsyncSession = Depends(get_db),
) -> MfaBackupCodesResponse:
    """Replace the backup codes. The previous set stops working immediately."""
    if session.scope != "full":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A full session is required.",
            headers={"code": "ERR_MFA_REQUIRED"},
        )
    codes = await mfa_svc.issue_backup_codes(db, session.teacher)
    return MfaBackupCodesResponse(backup_codes=codes)


@router.delete("/totp", status_code=status.HTTP_204_NO_CONTENT)
async def disable_totp(
    request: Request,
    session: PendingSession = Depends(get_pending_teacher),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Remove the authenticator.

    Refused when it would drop the account below two sign-in factors, or below
    its last means of decrypting its own data. That guard is what makes "any two
    of three" safe to offer: without it a teacher could delete their way out of
    their own account.
    """
    if session.scope != "full":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A full session is required.",
            headers={"code": "ERR_MFA_REQUIRED"},
        )

    teacher = session.teacher
    allowed, reason = await auth_policy.may_remove_factor(db, teacher, "totp")
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=reason or "That factor cannot be removed.",
            headers={"code": "ERR_LAST_FACTOR_PROTECTED"},
        )

    await mfa_svc.disable(db, teacher.id)
    await audit_svc.write(
        db,
        teacher_id=teacher.id,
        teacher_email=teacher.email,
        action="MFA_DISABLED",
        request_ip=request.client.host if request.client else None,
    )
