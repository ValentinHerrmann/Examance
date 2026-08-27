"""Auth router — /api/v1/auth/*"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import PendingSession, get_pending_teacher
from app.middleware.rate_limit import limiter
from app.models.refresh_token import RefreshToken
from app.models.teacher import Teacher
from app.schemas.auth import (
    AuthResponse,
    BackupCodeRequest,
    ForgotPasswordRequest,
    LoginRequest,
    ResetPasswordRequest,
    ResetTokenRequest,
    TotpFactorRequest,
)
from app.services import audit as audit_svc
from app.services import auth_policy, login_throttle, pending_token
from app.services import mfa as mfa_svc
from app.services.crypto import hash_password, needs_rehash, verify_password
from app.services.jwt import (
    access_token_ttl_seconds,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.services.key_envelope import replace_envelope_set
from app.services.password_reset import (
    complete_password_reset,
    create_and_send_reset_token,
    verify_reset_token,
)

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
    """
    Set the short-lived cookie for a sign-in that is not finished.

    No refresh cookie is issued: a half-authenticated session must not be
    renewable, and any refresh cookie left from an earlier session is cleared so
    it cannot be used to skip the remaining factor.
    """
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
    """
    Clear both auth cookies.

    The delete must repeat the attributes the cookie was set with. A
    ``SameSite=None`` cookie sent back without ``Secure`` is rejected outright
    by Chrome and Firefox, so an attribute mismatch here silently leaves the
    access cookie in place until it expires.
    """
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

    if teacher:
        _token, _sent = await create_and_send_reset_token(db, teacher)
        await audit_svc.write(
            db,
            teacher_id=teacher.id,
            teacher_email=teacher.email,
            action="PASSWORD_RESET_REQUESTED",
            request_ip=request.client.host if request.client else None,
        )

    return {
        "message": (
            "If an account exists for that email, a password reset link has been sent."
        )
    }


@router.post("/reset/start", response_model=AuthResponse)
@limiter.limit("10/hour")
async def start_reset(
    body: ResetTokenRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """
    Open a password reset with the emailed link.

    A reset re-establishes the password, so the password is unavailable by
    definition and the emailed token stands in for it — but only as *one* of the
    two factors the policy wants. Mailbox access alone completing a reset is
    exactly the bypass the second factor exists to close.

    An account that has not finished enrolling is the one exception: it has no
    second factor to offer, so requiring one would strand it. It gets a
    ``reset_pending`` token that can complete the reset on its own, and is held
    in enrollment at the next sign-in like every other single-factor account.
    """
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

    return AuthResponse(
        id=teacher.id,
        email=teacher.email,
        role=teacher.role,
        status="factor_required" if complete else "enroll_required",
        satisfied=amr,
        available=(
            await auth_policy.remaining_factors(db, teacher, amr) if complete else []
        ),
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
    """
    Set the new password, and store the re-wrapped data key with it.

    The envelope is written in the same transaction as the password on purpose.
    Two round trips could leave a teacher whose password changed but whose key
    copy did not, which is indistinguishable from a working account until the
    next sign-in fails to open anything.

    Without an envelope in the body the password wrap is marked unusable
    instead — the "I do not have my recovery code" path. The teacher keeps their
    account and is told plainly, on the next sign-in, that their existing data
    needs the recovery code.
    """
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
        teacher = await complete_password_reset(db, body.token, body.new_password)
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
    """
    Record that *factor* was proven and decide what the session becomes.

    Every factor endpoint funnels through here so the two-of-three rule is
    decided in one place. Three outcomes:

    * Fewer than two factors enrolled — the account gets an ``enroll`` token and
      can reach nothing but the enrollment endpoints.
    * Two distinct factors presented — a real session, with the refresh cookie
      and the LOGIN audit entry.
    * Otherwise — an ``auth_pending`` token plus the list of factors that may
      come next, which is safe to disclose now that one has been proven.
    """
    amr = sorted({*already_presented, factor})

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
    """
    Reject a pending token that is the wrong kind, or already spent.

    Consuming the token is what makes it single-use, so it happens here — but
    only *after* the scope check, and the caller is responsible for handing the
    teacher a fresh one when the factor itself turns out to be wrong. See
    `_reissue_pending`: a mistyped code must cost an attempt, not the sign-in.
    """
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
    """
    Headers that hand back an equivalent pending token after a factor was rejected.

    The single-use property exists so a captured token cannot be replayed to
    collect a second factor twice. It was never meant to punish a typo — but
    consuming it before verifying the code did exactly that: one wrong digit, or
    a phone whose clock had drifted, burned the token and every retry then failed
    as an expired step, with no way forward but reloading the page.

    Returned as headers rather than set on the injected `Response` because these
    paths all end in a raised `HTTPException`, and FastAPI merges that response
    only on the success path — a cookie set there is silently dropped. Verified
    by test, not assumed.

    Only the access cookie is reissued: the refresh cookie was already cleared
    when the sign-in started, and must stay cleared. Retries remain bounded by
    the per-account throttle, which counts this failure.
    """
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


@router.post("/factor/totp", response_model=AuthResponse)
@limiter.limit("10/minute;50/hour")
async def factor_totp(
    body: TotpFactorRequest,
    request: Request,
    response: Response,
    session: PendingSession = Depends(get_pending_teacher),
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """
    Present an authenticator code as the second factor.

    Second position only. A TOTP code does not identify an account, so accepting
    one first would mean taking an email address alongside it — turning this into
    a probe for which addresses have accounts. Password and passkey both identify
    the account by themselves, so requiring one of them first costs nothing.
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

    if not await mfa_svc.verify_totp(db, teacher, body.code):
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
        # An account without a password answers exactly like a wrong password.
        # The distinct ERR_PASSWORD_NOT_SET response that used to live here told
        # an unauthenticated caller which addresses have accounts; the "you have
        # not set a password yet" hint belongs in the reset mail instead.
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
    if rt is None or rt.revoked:
        # Possible token theft — revoke all tokens for this teacher
        if rt is not None:
            teacher_id = rt.teacher_id
            # Revoke all refresh tokens for this teacher
            from sqlalchemy import update

            await db.execute(
                update(RefreshToken)
                .where(RefreshToken.teacher_id == teacher_id, RefreshToken.revoked.is_(False))
                .values(revoked=True)
            )
        raise credentials_exc

    # Revoke old token
    rt.revoked = True

    teacher_id = uuid.UUID(payload["sub"])
    result2 = await db.execute(select(Teacher).where(Teacher.id == teacher_id))
    teacher = result2.scalar_one_or_none()
    if teacher is None:
        raise credentials_exc

    # Re-check the policy rather than trusting the token.
    #
    # This used to mint a `full` access token unconditionally, which made the
    # refresh cookie a way around the two-of-three rule entirely: anything
    # holding one — a cookie left over from before the policy, or one a browser
    # failed to drop when `_set_pending_cookie` deleted it — could upgrade a
    # half-finished sign-in straight to a full session. The `amr` now travels on
    # the refresh token, and an account whose factors have since been reset fails
    # closed into enrollment instead of being handed a session.
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
    """
    Clear auth cookies and revoke the refresh token.

    Deliberately requires no session. It used to depend on a full one, which
    meant a teacher who abandoned a half-finished sign-in — or whose access token
    had simply expired — could not clear their own cookies: logout answered 403
    and the pending cookie sat there until it timed out. Clearing cookies is
    never an action that needs protecting; the refresh revocation below is
    authenticated by the refresh token itself.
    """
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
