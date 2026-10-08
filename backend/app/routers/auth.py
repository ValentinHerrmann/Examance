"""Auth router — /api/v1/auth/*"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import jwt
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Cookie,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import PendingSession, get_pending_teacher
from app.middleware.rate_limit import limiter
from app.models.exam import Exam
from app.models.exercise import Exercise
from app.models.key_envelope import KeyEnvelope
from app.models.refresh_token import RefreshToken
from app.models.teacher import Teacher
from app.schemas.auth import (
    AccountDeletionPreview,
    AccountDeletionTokenRequest,
    AuthResponse,
    BackupCodeRequest,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    PasswordFactorRequest,
    RegisterCompleteRequest,
    RegisterCompleteResponse,
    RegisterRequest,
    ResetPasswordRequest,
    ResetTokenRequest,
    TotpFactorRequest,
)
from app.services import (
    account_deletion,
    account_mail,
    auth_policy,
    login_throttle,
    pending_token,
    registration,
)
from app.services import audit as audit_svc
from app.services import mfa as mfa_svc
from app.services.crypto import hash_password, needs_rehash, verify_password
from app.services.jwt import (
    access_token_ttl_seconds,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.services.key_envelope import invalidate_password_wrap, replace_envelope_set
from app.services.password_reset import (
    complete_password_reset,
    create_reset_token,
    verify_reset_token,
)
from app.services.tokens import rowcount

router = APIRouter(prefix="/auth", tags=["auth"])

# Cookie names
ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"

_COOKIE_KWARGS = dict(httponly=True, secure=True, samesite="none")


def _set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    refresh_max_age: int,
) -> None:
    response.set_cookie(
        ACCESS_COOKIE,
        access_token,
        max_age=access_token_ttl_seconds("full"),
        **_COOKIE_KWARGS,  # type: ignore[arg-type]
    )
    response.set_cookie(
        REFRESH_COOKIE,
        refresh_token,
        max_age=refresh_max_age,
        path="/api/v1/auth/refresh",
        **_COOKIE_KWARGS,  # type: ignore[arg-type]
    )


def _set_pending_cookie(response: Response, token: str, scope: str) -> None:
    """Set the short-lived cookie for a sign-in that is not finished.

    No refresh cookie is issued (a half-authenticated session must not be renewable), and any
    older refresh cookie is cleared so it cannot be used to skip the remaining factor."""
    response.set_cookie(
        ACCESS_COOKIE,
        token,
        max_age=access_token_ttl_seconds(scope),
        **_COOKIE_KWARGS,  # type: ignore[arg-type]
    )
    response.delete_cookie(
        REFRESH_COOKIE,
        path="/api/v1/auth/refresh",
        **_COOKIE_KWARGS,  # type: ignore[arg-type]
    )


def _clear_auth_cookies(response: Response) -> None:
    """Clear both auth cookies.

    The delete must repeat the attributes the cookie was set with: Chrome and Firefox reject a
    `SameSite=None` cookie sent without `Secure`, silently leaving the access cookie in place."""
    response.delete_cookie(ACCESS_COOKIE, path="/", **_COOKIE_KWARGS)  # type: ignore[arg-type]
    response.delete_cookie(
        REFRESH_COOKIE,
        path="/api/v1/auth/refresh",
        **_COOKIE_KWARGS,  # type: ignore[arg-type]
    )


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
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
        await audit_svc.write(
            db,
            teacher_id=teacher.id,
            teacher_email=teacher.email,
            action="PASSWORD_RESET_REQUESTED",
            request_ip=request.client.host if request.client else None,
        )
        # Committed before the response, and the mail sent after it: awaiting SMTP here made
        # an existing address measurably slower to answer than an unknown one.
        await db.commit()
        background_tasks.add_task(account_mail.send_all, [mail])

    return {
        "message": (
            "If an account exists for that email, a password reset link has been sent."
        )
    }


@router.post("/register", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("20/hour")
async def register(
    body: RegisterRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Ask for an account: mails a verification link to the address; nothing is created until used.

    Answers the same whether or not the address already has an account (nothing is mailed then),
    and the mail goes out after the response so timing does not tell either."""
    email = registration.normalize_email(body.email)
    try:
        mail = await registration.request_registration(db, email)
        await db.commit()
    except IntegrityError:
        # A concurrent request for the same address won the insert; its mail covers this one.
        await db.rollback()
        mail = None
    if mail is not None:
        background_tasks.add_task(account_mail.send_all, [mail])
    return {
        "message": (
            "If this address can be registered, a confirmation link has been sent to it."
        )
    }


@router.post("/register/complete", response_model=RegisterCompleteResponse)
@limiter.limit("20/hour")
async def complete_registration(
    body: RegisterCompleteRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> RegisterCompleteResponse:
    """Verify the address with the mailed token and create the account with the chosen password.

    An address on the admin's always-allowed list is approved at once, any other account waits
    for an admin (notified). Neither issues a session: the registrant signs in and enrolls then."""
    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="This confirmation link is invalid or has expired. Register again.",
        headers={"code": "ERR_INVALID_REGISTRATION_TOKEN"},
    )
    try:
        teacher = await registration.complete_registration(
            db, body.token, body.new_password, body.note
        )
        approved = teacher.approved_at is not None
        ip = request.client.host if request.client else None
        await audit_svc.write(
            db,
            teacher_id=teacher.id,
            teacher_email=teacher.email,
            action="USER_REGISTERED",
            request_ip=ip,
        )
        if approved:
            await audit_svc.write(
                db,
                teacher_id=teacher.id,
                teacher_email="system:allowed-domain",
                action="USER_APPROVED",
                target_id=str(teacher.id),
                request_ip=ip,
            )
        notices = [] if approved else await registration.admin_notices(db, teacher)
        await db.commit()
    except (registration.RegistrationTokenError, IntegrityError):
        await db.rollback()
        raise invalid from None

    if notices:
        background_tasks.add_task(account_mail.send_all, notices)
    return RegisterCompleteResponse(status="approved" if approved else "pending")


@router.post("/account-deletion/preview", response_model=AccountDeletionPreview)
@limiter.limit("20/hour")
async def preview_account_deletion(
    body: AccountDeletionTokenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AccountDeletionPreview:
    """
    What the mailed self-deletion link would delete, for the confirmation page. Deletes nothing:
    a mail scanner that opens the link must not delete the account.
    """
    deletion, teacher = await account_deletion.find_deletion_request(db, body.token)
    return AccountDeletionPreview(
        email=teacher.email,
        keep_exercises=deletion.keep_exercises,
        expires_at=deletion.expires_at,
    )


@router.post("/account-deletion/confirm", status_code=status.HTTP_200_OK)
@limiter.limit("20/hour")
async def confirm_account_deletion(
    body: AccountDeletionTokenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """GDPR Art. 17: delete the account behind the mailed single-use link (last admin refused).

    No session needed (the link proves the mailbox); exercises stay ownerless if the holder asked.
    Cookies are left alone (they may belong to another account; this one's tokens die with it)."""
    deletion, teacher = await account_deletion.claim_deletion_request(db, body.token)
    await account_deletion.ensure_not_last_admin(db, teacher)
    result = await account_deletion.delete_account(
        db,
        teacher,
        actor=teacher,
        keep_exercises=deletion.keep_exercises,
        request_ip=request.client.host if request.client else None,
    )
    return {
        "status": "ok",
        "account_deleted": True,
        "kept_exercises": deletion.keep_exercises,
        "purged_student_identities": result.purged_student_identities,
        "purged_submissions": result.purged_submissions,
        "retention_until": result.retention_until.isoformat(),
    }


@router.post("/reset/start", response_model=AuthResponse)
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
    scope_token = create_access_token(
        teacher.id, teacher.email, teacher.role, scope="reset_pending", amr=amr
    )
    await pending_token.register(decode_token(scope_token).get("jti"))
    _set_pending_cookie(response, scope_token, "reset_pending")

    # Something to recover exists once the account holds a key copy, or authored anything (an
    # account from before key envelopes holds data sealed under its old password). A fresh
    # account, invited or self-registered, has neither and skips the recovery-code step.
    holds_key_or_data = False
    for model in (KeyEnvelope, Exam, Exercise):
        found = await db.scalar(select(model.id).where(model.teacher_id == teacher.id).limit(1))
        if found is not None:
            holds_key_or_data = True
            break

    return AuthResponse(
        id=teacher.id,
        email=teacher.email,
        role=teacher.role,
        status="factor_required" if complete else "enroll_required",
        satisfied=amr,
        available=(
            await auth_policy.remaining_factors(db, teacher, amr) if complete else []
        ),
        needs_key_recovery=holds_key_or_data,
    )


@router.post("/reset-password", status_code=status.HTTP_200_OK)
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

    await audit_svc.write(
        db,
        teacher_id=teacher.id,
        teacher_email=teacher.email,
        action="PASSWORD_RESET_COMPLETED",
        request_ip=request.client.host if request.client else None,
    )
    _clear_auth_cookies(response)

    return {"message": "Password has been successfully set. You can now log in."}


@router.post("/change-password", status_code=status.HTTP_200_OK)
@limiter.limit("5/hour")
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    response: Response,
    session: PendingSession = Depends(get_pending_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Change the password of a signed-in account, keeping the session.

    The client re-wraps the data key; wrap and password go in one transaction so they never diverge.
    The current password uses the `/auth/login` throttle, else this is a cooloff-free oracle."""
    if session.scope != "full":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A full session is required.",
            headers={"code": "ERR_MFA_REQUIRED"},
        )

    teacher = session.teacher
    normalized_email = teacher.email.strip().lower()
    await login_throttle.assert_not_locked(normalized_email, teacher)

    stored_hash = teacher.password_hash
    dummy_hash = "$argon2id$v=19$m=65536,t=3,p=4$fakesaltfakesalt$fakehashfakehashfakehashfakehash"
    if not verify_password(body.current_password, stored_hash or dummy_hash) or stored_hash is None:
        await login_throttle.register_failure(db, normalized_email, teacher)
        await audit_svc.write(
            db,
            teacher_id=teacher.id,
            teacher_email=teacher.email,
            action="LOGIN_FAILED",
            request_ip=request.client.host if request.client else None,
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That is not your current password.",
            headers={"code": "ERR_INVALID_CREDENTIALS"},
        )

    await login_throttle.register_success(db, normalized_email, teacher)

    teacher.password_hash = hash_password(body.new_password)
    teacher.password_changed_at = datetime.now(tz=UTC)

    if body.envelope is not None:
        await replace_envelope_set(db, teacher, body.envelope)
    else:
        # No re-wrap arrived, so the stored wrap no longer opens under this password and the server
        # has never seen the key. Marking it stale sends the teacher to the recovery code instead
        # of a vault that silently reads as empty.
        await invalidate_password_wrap(db, teacher.id)

    # Revoke every session and re-issue this one: the refresh cookie is path-scoped to
    # `/auth/refresh`, so the caller's stored token cannot be identified. Also stricter: no token
    # that predates the password change survives.
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.teacher_id == teacher.id, RefreshToken.revoked.is_(False))
        .values(revoked=True)
    )

    new_access = create_access_token(
        teacher.id, teacher.email, teacher.role, scope="full", amr=session.amr
    )
    new_refresh, new_jti = create_refresh_token(
        teacher.id, teacher.email, teacher.role, amr=session.amr
    )
    db.add(
        RefreshToken(
            jti=new_jti,
            teacher_id=teacher.id,
            expires_at=datetime.fromtimestamp(decode_token(new_refresh)["exp"], tz=UTC),
        )
    )
    _set_auth_cookies(
        response,
        new_access,
        new_refresh,
        refresh_max_age=settings.REFRESH_TOKEN_TTL_DAYS * 86400,
    )

    await audit_svc.write(
        db,
        teacher_id=teacher.id,
        teacher_email=teacher.email,
        action="PASSWORD_CHANGED",
        request_ip=request.client.host if request.client else None,
    )

    return {"message": "Password changed."}


async def advance_sign_in(
    db: AsyncSession,
    request: Request,
    response: Response,
    teacher: Teacher,
    factor: str,
    already_presented: list[str],
    *,
    flow: str = "auth_pending",
) -> AuthResponse:
    """Record that *factor* was proven and decide the session; the sign-in rule lives only here.

    Outcomes: `enroll` token (<2 factors enrolled); full session + refresh cookie + LOGIN audit
    (passkey or two distinct factors); else `auth_pending` plus the factors that may come next."""
    amr = sorted({*already_presented, factor})

    # An account no admin has approved yet holds no token of any kind: not a session, not an
    # enrollment token, not a reset. Answered only now that a factor was proven, so it tells
    # nothing to someone who merely knows the address.
    if teacher.approved_at is None:
        _clear_auth_cookies(response)
        return AuthResponse(
            id=teacher.id,
            email=teacher.email,
            role=teacher.role,
            status="approval_pending",
            satisfied=amr,
            available=[],
        )

    # Factor activity for the security page, recorded here because every proven factor passes
    # through; a passkey's own timestamp is written by the WebAuthn service (it knows *which*
    # credential answered).
    if factor == "password":
        teacher.password_last_used_at = datetime.now(tz=UTC)

    if flow == "reset_pending":
        # A reset collects its factors and then sets a password. It must never
        # hand out a session on the way: the account is mid-reset, and the
        # teacher has not yet proven they can choose its new password.
        token = create_access_token(
            teacher.id, teacher.email, teacher.role, scope="reset_pending", amr=amr
        )
        await pending_token.register(decode_token(token).get("jti"))
        _set_pending_cookie(response, token, "reset_pending")
        return AuthResponse(
            id=teacher.id,
            email=teacher.email,
            role=teacher.role,
            status="ok" if auth_policy.satisfies(amr) else "factor_required",
            satisfied=amr,
            available=await auth_policy.remaining_factors(db, teacher, amr),
        )

    if not await auth_policy.is_enrollment_complete(db, teacher):
        token = create_access_token(
            teacher.id, teacher.email, teacher.role, scope="enroll", amr=amr
        )
        await pending_token.register(decode_token(token).get("jti"))
        _set_pending_cookie(response, token, "enroll")
        return AuthResponse(
            id=teacher.id,
            email=teacher.email,
            role=teacher.role,
            status="enroll_required",
            satisfied=amr,
            available=[],
        )

    if not auth_policy.satisfies(amr):
        token = create_access_token(
            teacher.id, teacher.email, teacher.role, scope="auth_pending", amr=amr
        )
        await pending_token.register(decode_token(token).get("jti"))
        _set_pending_cookie(response, token, "auth_pending")
        return AuthResponse(
            id=teacher.id,
            email=teacher.email,
            role=teacher.role,
            status="factor_required",
            satisfied=amr,
            available=await auth_policy.remaining_factors(db, teacher, amr),
        )

    access_token = create_access_token(
        teacher.id, teacher.email, teacher.role, scope="full", amr=amr
    )
    refresh_jwt, jti = create_refresh_token(teacher.id, teacher.email, teacher.role, amr=amr)
    decoded = decode_token(refresh_jwt)
    db.add(
        RefreshToken(
            jti=jti,
            teacher_id=teacher.id,
            expires_at=datetime.fromtimestamp(decoded["exp"], tz=UTC),
        )
    )

    await audit_svc.write(
        db,
        teacher_id=teacher.id,
        teacher_email=teacher.email,
        action="LOGIN",
        request_ip=request.client.host if request.client else None,
    )

    _set_auth_cookies(
        response,
        access_token,
        refresh_jwt,
        refresh_max_age=settings.REFRESH_TOKEN_TTL_DAYS * 86400,
    )
    return AuthResponse(
        id=teacher.id,
        email=teacher.email,
        role=teacher.role,
        status="ok",
        satisfied=amr,
        available=[],
    )


async def _require_pending(session: PendingSession, *, allow_scopes: set[str]) -> None:
    """Reject a pending token that is the wrong kind, or already spent.

    Consuming the token makes it single-use, so it happens here, but only *after* the scope check.
    The caller hands out a fresh one when the factor is wrong (`_reissue_pending`)."""
    if session.scope not in allow_scopes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Start the sign-in again.",
            headers={"code": "ERR_FACTOR_REQUIRED"},
        )
    if not await pending_token.consume(session.jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This sign-in step has expired. Start again.",
            headers={"code": "ERR_STEP_EXPIRED"},
        )


async def _reissue_pending_headers(session: PendingSession) -> dict[str, str]:
    """Headers that reissue an equivalent pending token after a rejected factor.

    A typo must cost an attempt, not the single-use step. Headers, not `Response` cookies, since
    FastAPI drops those on a raised `HTTPException`. Only the access cookie is reissued."""
    token = create_access_token(
        session.teacher.id,
        session.teacher.email,
        session.teacher.role,
        scope=session.scope,
        amr=session.amr,
    )
    await pending_token.register(decode_token(token).get("jti"))

    carrier = Response()
    carrier.set_cookie(
        ACCESS_COOKIE,
        token,
        max_age=access_token_ttl_seconds(session.scope),
        **_COOKIE_KWARGS,  # type: ignore[arg-type]
    )
    return {"set-cookie": carrier.headers["set-cookie"]}


@router.post("/factor/password", response_model=AuthResponse)
@limiter.limit("10/minute;50/hour")
async def factor_password(
    body: PasswordFactorRequest,
    request: Request,
    response: Response,
    session: PendingSession = Depends(get_pending_teacher),
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """Present the password as the *second* factor (`/auth/login` can only open a sign-in).

    The account comes from the pending token; taking an email here would make the second step an
    account-existence probe. Not reachable in the reset flow (the emailed token stands in)."""
    # Scope before anything else, so the reset refusal is about the flow rather
    # than about a reset token happening to carry `password` in its amr.
    if session.scope != "auth_pending":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The password cannot be used as a factor here.",
            headers={"code": "ERR_FACTOR_REQUIRED"},
        )
    # Checked before the token is consumed: presenting a factor twice is a
    # mistake to correct, not a sign-in to end.
    if "password" in session.amr:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That factor has already been used for this sign-in.",
            headers={"code": "ERR_FACTOR_ALREADY_PRESENTED"},
        )
    await _require_pending(session, allow_scopes={"auth_pending"})

    teacher = session.teacher
    await login_throttle.assert_not_locked(teacher.email, teacher)

    stored_hash = teacher.password_hash
    dummy_hash = "$argon2id$v=19$m=65536,t=3,p=4$fakesaltfakesalt$fakehashfakehashfakehashfakehash"
    if not verify_password(body.password, stored_hash or dummy_hash) or stored_hash is None:
        await login_throttle.register_failure(db, teacher.email, teacher)
        await audit_svc.write(
            db,
            teacher_id=teacher.id,
            teacher_email=teacher.email,
            action="LOGIN_FAILED",
            request_ip=request.client.host if request.client else None,
        )
        retry_headers = await _reissue_pending_headers(session)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
            headers={"code": "ERR_INVALID_CREDENTIALS", **retry_headers},
        )

    await login_throttle.register_success(db, teacher.email, teacher)
    if needs_rehash(stored_hash):
        teacher.password_hash = hash_password(body.password)

    return await advance_sign_in(
        db, request, response, teacher, "password", session.amr, flow=session.scope
    )


@router.post("/factor/totp", response_model=AuthResponse)
@limiter.limit("10/minute;50/hour")
async def factor_totp(
    body: TotpFactorRequest,
    request: Request,
    response: Response,
    session: PendingSession = Depends(get_pending_teacher),
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """Present an authenticator code as the second factor.

    Second position only: a TOTP code does not identify an account, so accepting it first would
    need an email alongside it, a probe for which addresses have accounts."""
    if "totp" in session.amr:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That factor has already been used for this sign-in.",
            headers={"code": "ERR_FACTOR_ALREADY_PRESENTED"},
        )
    await _require_pending(session, allow_scopes={"auth_pending", "reset_pending"})

    teacher = session.teacher
    await login_throttle.assert_not_locked(teacher.email, teacher)

    outcome = await mfa_svc.verify_totp(db, teacher, body.code)

    if outcome == "replayed":
        # Genuine code whose window is already spent (e.g. right after a password reset took one).
        # Not a guess: it costs no attempt and no audit row, only a wait.
        retry_headers = await _reissue_pending_headers(session)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That code has already been used. Wait for the next one.",
            headers={"code": "ERR_MFA_CODE_ALREADY_USED", **retry_headers},
        )

    if outcome != "ok":
        await login_throttle.register_failure(db, teacher.email, teacher)
        await audit_svc.write(
            db,
            teacher_id=teacher.id,
            teacher_email=teacher.email,
            action="LOGIN_FAILED",
            request_ip=request.client.host if request.client else None,
        )
        retry_headers = await _reissue_pending_headers(session)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication code.",
            headers={"code": "ERR_MFA_INVALID_CODE", **retry_headers},
        )

    await login_throttle.register_success(db, teacher.email, teacher)
    return await advance_sign_in(
        db, request, response, teacher, "totp", session.amr, flow=session.scope
    )


@router.post("/factor/backup-code", response_model=AuthResponse)
@limiter.limit("10/minute;50/hour")
async def factor_backup_code(
    body: BackupCodeRequest,
    request: Request,
    response: Response,
    session: PendingSession = Depends(get_pending_teacher),
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """
    Spend a backup code in place of the authenticator.

    It counts as the ``totp`` factor, so it cannot be paired with a TOTP code to
    make up two: it stands in for that factor rather than adding one.
    """
    if "totp" in session.amr:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That factor has already been used for this sign-in.",
            headers={"code": "ERR_FACTOR_ALREADY_PRESENTED"},
        )
    await _require_pending(session, allow_scopes={"auth_pending", "reset_pending"})

    teacher = session.teacher
    await login_throttle.assert_not_locked(teacher.email, teacher)

    if not await mfa_svc.consume_backup_code(db, teacher, body.code):
        await login_throttle.register_failure(db, teacher.email, teacher)
        retry_headers = await _reissue_pending_headers(session)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication code.",
            headers={"code": "ERR_MFA_INVALID_CODE", **retry_headers},
        )

    await login_throttle.register_success(db, teacher.email, teacher)
    return await advance_sign_in(
        db, request, response, teacher, "totp", session.amr, flow=session.scope
    )


@router.post("/login", response_model=AuthResponse)
@limiter.limit("10/minute;50/hour")
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """
    Verify credentials, set httpOnly access + refresh cookies.

    Response body contains only { email, role } — never the token value.
    """
    normalized_email = body.email.strip().lower()
    result = await db.execute(select(Teacher).where(func.lower(Teacher.email) == normalized_email))
    teacher = result.scalar_one_or_none()

    # Rejects a locked account before any password work is done. Runs for
    # unknown emails too, so a locked and an unknown account cost the same.
    await login_throttle.assert_not_locked(normalized_email, teacher)

    stored_hash = teacher.password_hash if teacher else None

    # Constant-time: always call verify_password even if teacher not found
    dummy_hash = "$argon2id$v=19$m=65536,t=3,p=4$fakesaltfakesalt$fakehashfakehashfakehashfakehash"
    password_ok = verify_password(body.password, stored_hash if stored_hash else dummy_hash)

    if not teacher or stored_hash is None or not password_ok:
        # An account without a password answers exactly like a wrong password: a distinct response
        # would tell an unauthenticated caller which addresses have accounts (the "not set a
        # password yet" hint belongs in the reset mail).
        cooloff = await login_throttle.register_failure(db, normalized_email, teacher)
        if teacher is not None:
            # Only for accounts that exist: audit_log.teacher_email is NOT NULL,
            # and a row per attacker-supplied address makes the log unbounded.
            await audit_svc.write(
                db,
                teacher_id=teacher.id,
                teacher_email=teacher.email,
                action="LOGIN_FAILED",
                request_ip=request.client.host if request.client else None,
            )
            if cooloff is not None:
                await audit_svc.write(
                    db,
                    teacher_id=teacher.id,
                    teacher_email=teacher.email,
                    action="ACCOUNT_LOCKED",
                    request_ip=request.client.host if request.client else None,
                )
        # get_db rolls back on an exception, so the lock mirror and the audit
        # row have to be committed before the 401 is raised or neither survives.
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
            headers={"code": "ERR_INVALID_CREDENTIALS"},
        )

    await login_throttle.register_success(db, normalized_email, teacher)

    # Rehash if parameters changed
    if needs_rehash(stored_hash):
        teacher.password_hash = hash_password(body.password)

    return await advance_sign_in(db, request, response, teacher, "password", [])


@router.post("/refresh", response_model=AuthResponse)
@limiter.limit("30/minute")
async def refresh(
    request: Request,  # Required by slowapi for rate limiting
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """
    Issue new access + refresh cookies, revoke the old refresh token.

    Detects concurrent use (token theft) if the token is already revoked.
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Session expired. Please log in again.",
    )
    if not refresh_token:
        raise credentials_exc

    try:
        payload = decode_token(refresh_token)
    except jwt.InvalidTokenError:
        raise credentials_exc from None

    if payload.get("type") != "refresh":
        raise credentials_exc

    jti = payload.get("jti")
    if not jti:
        raise credentials_exc

    result = await db.execute(select(RefreshToken).where(RefreshToken.jti == jti))
    rt = result.scalar_one_or_none()
    if rt is None:
        raise credentials_exc
    # Claim it in one conditional UPDATE, so of two concurrent uses only one rotates. A token that
    # was already rotated is presented again: possible theft, so the whole family is revoked.
    claimed = await db.execute(
        update(RefreshToken)
        .where(RefreshToken.jti == jti, RefreshToken.revoked.is_(False))
        .values(revoked=True)
    )
    if rowcount(claimed) != 1:
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.teacher_id == rt.teacher_id, RefreshToken.revoked.is_(False))
            .values(revoked=True)
        )
        # get_db rolls back on the 401 below; the revocation must survive it.
        await db.commit()
        raise credentials_exc

    teacher_id = uuid.UUID(payload["sub"])
    result2 = await db.execute(select(Teacher).where(Teacher.id == teacher_id))
    teacher = result2.scalar_one_or_none()
    if teacher is None or teacher.approved_at is None:
        raise credentials_exc

    # Re-check the policy, never trust the token: a refresh cookie must not upgrade a half-finished
    # sign-in to a full session. The `amr` travels on the refresh token; an account whose factors
    # were reset since fails closed into enrollment.
    amr = payload.get("amr") or []
    if not isinstance(amr, list):
        amr = []
    amr = [str(factor) for factor in amr]

    if not await auth_policy.is_enrollment_complete(db, teacher):
        scope = "enroll"
    elif auth_policy.satisfies(amr):
        scope = "full"
    else:
        scope = "auth_pending"

    if scope != "full":
        token = create_access_token(
            teacher.id, teacher.email, teacher.role, scope=scope, amr=amr
        )
        await pending_token.register(decode_token(token).get("jti"))
        _set_pending_cookie(response, token, scope)
        return AuthResponse(
            id=teacher.id,
            email=teacher.email,
            role=teacher.role,
            status="enroll_required" if scope == "enroll" else "factor_required",
            satisfied=amr,
            available=(
                [] if scope == "enroll"
                else await auth_policy.remaining_factors(db, teacher, amr)
            ),
        )

    # Issue new tokens
    new_access = create_access_token(
        teacher.id, teacher.email, teacher.role, scope="full", amr=amr
    )
    new_refresh_jwt, new_jti = create_refresh_token(
        teacher.id, teacher.email, teacher.role, amr=amr
    )
    decoded = decode_token(new_refresh_jwt)
    new_rt = RefreshToken(
        jti=new_jti,
        teacher_id=teacher.id,
        expires_at=datetime.fromtimestamp(decoded["exp"], tz=UTC),
    )
    db.add(new_rt)


    _set_auth_cookies(
        response,
        new_access,
        new_refresh_jwt,
        refresh_max_age=settings.REFRESH_TOKEN_TTL_DAYS * 86400,
    )
    return AuthResponse(
        id=teacher.id,
        email=teacher.email,
        role=teacher.role,
        status="ok",
        satisfied=amr,
        available=[],
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Clear auth cookies and revoke the refresh token.

    Deliberately needs no session, so a teacher with a half-finished or expired sign-in can still
    clear their cookies. The revocation is authenticated by the refresh token itself."""
    if refresh_token:
        try:
            payload = decode_token(refresh_token)
            jti = payload.get("jti")
            if jti:
                result = await db.execute(select(RefreshToken).where(RefreshToken.jti == jti))
                rt = result.scalar_one_or_none()
                if rt:
                    rt.revoked = True
        except jwt.InvalidTokenError:
            pass  # Best-effort revocation
    _clear_auth_cookies(response)
