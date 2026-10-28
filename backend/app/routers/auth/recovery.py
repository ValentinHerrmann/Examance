"""Password recovery: reset link, reset session, new password — /api/v1/auth/*"""
from __future__ import annotations

import secrets

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import PendingSession, get_pending_teacher, require_not_frozen
from app.middleware.rate_limit import limiter
from app.models.exam import Exam
from app.models.exercise import Exercise
from app.models.key_envelope import KeyEnvelope
from app.models.password_reset_token import PasswordResetToken
from app.models.teacher import Teacher
from app.routers.auth.session import auth_response, clear_auth_cookies, issue_pending
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    ResetTokenRequest,
)
from app.services import account_mail, auth_policy, pending_token
from app.services import audit as audit_svc
from app.services.key_envelope import replace_envelope_set
from app.services.password_reset import (
    complete_password_reset,
    create_reset_token,
    verify_reset_token,
)
from app.services.tokens import hash_token

# Two routers: docs/openapi.json (diffed in CI) lists /forgot-password ahead of the registration
# paths and the reset steps after them, and path order is registration order.
forgot_router = APIRouter()
reset_router = APIRouter()


@forgot_router.post("/forgot-password", status_code=status.HTTP_200_OK)
@limiter.limit("5/hour")
async def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """
    Request a password reset link sent to the user's email address.
    """
    normalized_email = body.email.strip().lower()
    result = await db.execute(
        select(Teacher).where(func.lower(Teacher.email) == normalized_email)
    )
    teacher = result.scalar_one_or_none()

    # A pending account gets no reset link: it holds no token of any kind until approved.
    if teacher and teacher.approved_at is not None:
        _token, mail = await create_reset_token(db, teacher)
        await audit_svc.log(db, request, teacher, "PASSWORD_RESET_REQUESTED")
        # Committed before the response, and the mail sent after it: awaiting SMTP here made
        # an existing address measurably slower to answer than an unknown one.
        await db.commit()
        background_tasks.add_task(account_mail.send_all, [mail])
    else:
        # A comparable query and commit, so an unknown address does not answer measurably faster.
        await db.execute(
            delete(PasswordResetToken).where(
                PasswordResetToken.token_hash == hash_token(secrets.token_urlsafe(32))
            )
        )
        await db.commit()

    return {
        "message": (
            "If an account exists for that email, a password reset link has been sent."
        )
    }


@reset_router.post("/reset/start", response_model=AuthResponse)
@limiter.limit("10/hour")
async def start_reset(
    body: ResetTokenRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """Open a password reset with the emailed link (the token is *one* of the two required factors).

    Mailbox access alone must not complete a reset. An account that has not finished enrolling has
    no second factor to offer, so it gets a `reset_pending` token that completes it alone."""
    token_record, teacher = await verify_reset_token(db, body.token)
    if not token_record or not teacher:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token.",
            headers={"code": "ERR_INVALID_TOKEN"},
        )

    amr = ["password"]
    complete = await auth_policy.is_enrollment_complete(db, teacher)
    await issue_pending(response, teacher, "reset_pending", amr)

    # Something to recover exists once the account holds a key copy, or authored anything (an
    # account from before key envelopes holds data sealed under its old password). A fresh
    # account, invited or self-registered, has neither and skips the recovery-code step.
    holds_key_or_data = False
    for model in (KeyEnvelope, Exam, Exercise):
        found = await db.scalar(select(model.id).where(model.teacher_id == teacher.id).limit(1))
        if found is not None:
            holds_key_or_data = True
            break

    result = auth_response(
        teacher,
        "factor_required" if complete else "enroll_required",
        amr,
        await auth_policy.remaining_factors(db, teacher, amr) if complete else [],
    )
    result.needs_key_recovery = holds_key_or_data
    return result


@reset_router.post(
    "/reset-password",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_not_frozen)],
)
@limiter.limit("5/hour")
async def reset_password(
    body: ResetPasswordRequest,
    request: Request,
    response: Response,
    session: PendingSession = Depends(get_pending_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Set the new password and store the re-wrapped data key with it, in one transaction.

    A password without its key copy looks like a working account until a sign-in opens nothing.
    No envelope: the password wrap is marked unusable and the teacher needs the recovery code."""
    if session.scope != "reset_pending":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Start the password reset again.",
            headers={"code": "ERR_FACTOR_REQUIRED"},
        )

    teacher = session.teacher
    if not auth_policy.satisfies(session.amr) and await auth_policy.is_enrollment_complete(
        db, teacher
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Another sign-in factor is required.",
            headers={"code": "ERR_MFA_REQUIRED"},
        )

    if not await pending_token.consume(session.jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This password reset has expired. Start again.",
            headers={"code": "ERR_FACTOR_REQUIRED"},
        )

    try:
        teacher = await complete_password_reset(
            db, body.token, body.new_password, teacher_id=teacher.id
        )
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err),
            headers={"code": "ERR_INVALID_TOKEN"},
        ) from err

    if body.envelope is not None:
        # The teacher unwrapped their data key in the browser and re-wrapped it
        # under the new password. `complete_password_reset` has just invalidated
        # the old password wrap; this replaces the whole set with the new one.
        await replace_envelope_set(db, teacher, body.envelope)

    await audit_svc.log(db, request, teacher, "PASSWORD_RESET_COMPLETED")
    clear_auth_cookies(response)

    return {"message": "Password has been successfully set. You can now log in."}
