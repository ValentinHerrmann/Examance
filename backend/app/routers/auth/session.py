"""Signed-in session: factors, login, refresh, logout, change-password — /api/v1/auth/*"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Literal, NoReturn

import jwt
from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import PendingSession, get_pending_teacher, require_not_frozen
from app.middleware.rate_limit import limiter
from app.models.refresh_token import RefreshToken
from app.models.teacher import Teacher
from app.schemas.auth import (
    AuthResponse,
    BackupCodeRequest,
    ChangePasswordRequest,
    LoginRequest,
    PasswordFactorRequest,
    TotpFactorRequest,
)
from app.services import audit as audit_svc
from app.services import auth_policy, login_throttle, maintenance, pending_token
from app.services import mfa as mfa_svc
from app.services.crypto import hash_password_async, needs_rehash, verify_password_async
from app.services.jwt import (
    access_token_ttl_seconds,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.services.key_envelope import invalidate_password_wrap, replace_envelope_set
from app.services.tokens import rowcount

router = APIRouter()

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


def clear_auth_cookies(response: Response) -> None:
    """Clear both auth cookies.

    The delete must repeat the attributes the cookie was set with: Chrome and Firefox reject a
    `SameSite=None` cookie sent without `Secure`, silently leaving the access cookie in place."""
    response.delete_cookie(ACCESS_COOKIE, path="/", **_COOKIE_KWARGS)  # type: ignore[arg-type]
    response.delete_cookie(
        REFRESH_COOKIE,
        path="/api/v1/auth/refresh",
        **_COOKIE_KWARGS,  # type: ignore[arg-type]
    )


def auth_response(
    teacher: Teacher,
    outcome: Literal["ok", "factor_required", "enroll_required", "approval_pending"],
    amr: list[str],
    available: list[str] | None = None,
) -> AuthResponse:
    return AuthResponse(
        id=teacher.id,
        email=teacher.email,
        role=teacher.role,
        status=outcome,
        satisfied=amr,
        available=available or [],
    )


async def issue_pending(response: Response, teacher: Teacher, scope: str, amr: list[str]) -> None:
    """Hand out the single-use token of an unfinished sign-in (*scope*) as the access cookie."""
    token = create_access_token(teacher.id, teacher.email, teacher.role, scope=scope, amr=amr)
    await pending_token.register(decode_token(token).get("jti"))
    _set_pending_cookie(response, token, scope)


async def _issue_session(
    db: AsyncSession, response: Response, teacher: Teacher, amr: list[str]
) -> None:
    """Start a full session: access + refresh token, the revocable refresh row, both cookies."""
    access_token = create_access_token(
        teacher.id, teacher.email, teacher.role, scope="full", amr=amr
    )
    refresh_jwt, jti = create_refresh_token(teacher.id, teacher.email, teacher.role, amr=amr)
    db.add(
        RefreshToken(
            jti=jti,
            teacher_id=teacher.id,
            expires_at=datetime.fromtimestamp(decode_token(refresh_jwt)["exp"], tz=UTC),
        )
    )
    _set_auth_cookies(
        response,
        access_token,
        refresh_jwt,
        refresh_max_age=settings.REFRESH_TOKEN_TTL_DAYS * 86400,
    )


@router.post(
    "/change-password",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_not_frozen)],
)
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

    if not await verify_password_async(body.current_password, teacher.password_hash):
        await login_throttle.register_failure(db, normalized_email, teacher)
        await audit_svc.log(db, request, teacher, "LOGIN_FAILED")
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That is not your current password.",
            headers={"code": "ERR_INVALID_CREDENTIALS"},
        )

    await login_throttle.register_success(db, normalized_email, teacher)

    teacher.password_hash = await hash_password_async(body.new_password)
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
    await _issue_session(db, response, teacher, session.amr)
    await audit_svc.log(db, request, teacher, "PASSWORD_CHANGED")

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
        clear_auth_cookies(response)
        return auth_response(teacher, "approval_pending", amr)

    # Factor activity for the security page, recorded here because every proven factor passes
    # through; a passkey's own timestamp is written by the WebAuthn service (it knows *which*
    # credential answered).
    if factor == "password":
        teacher.password_last_used_at = datetime.now(tz=UTC)

    if flow == "reset_pending":
        # A reset collects its factors and then sets a password. It must never
        # hand out a session on the way: the account is mid-reset, and the
        # teacher has not yet proven they can choose its new password.
        await issue_pending(response, teacher, "reset_pending", amr)
        return auth_response(
            teacher,
            "ok" if auth_policy.satisfies(amr) else "factor_required",
            amr,
            await auth_policy.remaining_factors(db, teacher, amr),
        )

    if not await auth_policy.is_enrollment_complete(db, teacher):
        await issue_pending(response, teacher, "enroll", amr)
        return auth_response(teacher, "enroll_required", amr)

    if not auth_policy.satisfies(amr):
        await issue_pending(response, teacher, "auth_pending", amr)
        return auth_response(
            teacher,
            "factor_required",
            amr,
            await auth_policy.remaining_factors(db, teacher, amr),
        )

    # Maintenance (issue #130): no new session after the second reminder; only here, after a
    # proven factor, so it reveals nothing about the address. Admins pass to end the window.
    await maintenance.ensure_sign_in_allowed(db, teacher.role)
    await login_throttle.register_success(db, teacher.email, teacher, session_issued=True)

    await _issue_session(db, response, teacher, amr)
    await audit_svc.log(db, request, teacher, "LOGIN")
    return auth_response(teacher, "ok", amr)


async def _require_pending(
    db: AsyncSession, session: PendingSession, *, allow_scopes: set[str]
) -> None:
    """Reject a pending token that is the wrong kind, or already spent.

    Consuming the token makes it single-use, so it happens here, but only *after* the scope check.
    The caller hands out a fresh one when the factor is wrong (`_reject_factor`)."""
    if session.scope not in allow_scopes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Start the sign-in again.",
            headers={"code": "ERR_FACTOR_REQUIRED"},
        )
    if session.scope == "auth_pending":
        # Before consuming, so a teacher refused for maintenance keeps the step (issue #130).
        await maintenance.ensure_sign_in_allowed(db, session.teacher.role)
    if not await pending_token.consume(session.jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This sign-in step has expired. Start again.",
            headers={"code": "ERR_STEP_EXPIRED"},
        )


async def reissue_pending_headers(session: PendingSession) -> dict[str, str]:
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


async def _reject_factor(
    db: AsyncSession,
    request: Request,
    session: PendingSession,
    *,
    detail: str,
    code: str,
    second_factor: bool = False,
    count: bool = True,
    audit: bool = True,
) -> NoReturn:
    """401 for a refused factor, with a fresh pending token: a typo costs an attempt, not the step.

    Committed before the raise: `get_db` rolls back on an exception, taking the failure count and
    the audit row with it. *count*/*audit* off = not a guess (a replayed code) or not audited."""
    teacher = session.teacher
    if count:
        await login_throttle.register_failure(
            db, teacher.email, teacher, second_factor=second_factor
        )
    if audit:
        await audit_svc.log(db, request, teacher, "LOGIN_FAILED")
    retry_headers = await reissue_pending_headers(session)
    await db.commit()
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"code": code, **retry_headers},
    )


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
    await _require_pending(db, session, allow_scopes={"auth_pending"})

    teacher = session.teacher
    await login_throttle.assert_not_locked(teacher.email, teacher)

    stored_hash = teacher.password_hash
    if stored_hash is None or not await verify_password_async(body.password, stored_hash):
        await _reject_factor(
            db, request, session, detail="Invalid credentials.", code="ERR_INVALID_CREDENTIALS"
        )

    await login_throttle.register_success(db, teacher.email, teacher)
    if needs_rehash(stored_hash):
        teacher.password_hash = await hash_password_async(body.password)

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
    await _require_pending(db, session, allow_scopes={"auth_pending", "reset_pending"})

    teacher = session.teacher
    await login_throttle.assert_not_locked(teacher.email, teacher)

    outcome = await mfa_svc.verify_totp(db, teacher, body.code)

    if outcome == "replayed":
        # Genuine code whose window is already spent (e.g. right after a password reset took one).
        # Not a guess: it costs no attempt and no audit row, only a wait.
        await _reject_factor(
            db,
            request,
            session,
            detail="That code has already been used. Wait for the next one.",
            code="ERR_MFA_CODE_ALREADY_USED",
            count=False,
            audit=False,
        )

    if outcome != "ok":
        await _reject_factor(
            db,
            request,
            session,
            detail="Invalid authentication code.",
            code="ERR_MFA_INVALID_CODE",
            second_factor=True,
        )

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
    await _require_pending(db, session, allow_scopes={"auth_pending", "reset_pending"})

    teacher = session.teacher
    await login_throttle.assert_not_locked(teacher.email, teacher)

    if not await mfa_svc.consume_backup_code(db, teacher, body.code):
        await _reject_factor(
            db,
            request,
            session,
            detail="Invalid authentication code.",
            code="ERR_MFA_INVALID_CODE",
            second_factor=True,
            audit=False,
        )

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
    # Runs Argon2 for unknown accounts too (dummy hash), so both cost the same.
    password_ok = await verify_password_async(body.password, stored_hash)

    if not teacher or stored_hash is None or not password_ok:
        # An account without a password answers exactly like a wrong password: a distinct response
        # would tell an unauthenticated caller which addresses have accounts (the "not set a
        # password yet" hint belongs in the reset mail).
        cooloff = await login_throttle.register_failure(db, normalized_email, teacher)
        if teacher is not None:
            # Only for accounts that exist: audit_log.teacher_email is NOT NULL,
            # and a row per attacker-supplied address makes the log unbounded.
            await audit_svc.log(db, request, teacher, "LOGIN_FAILED")
            if cooloff is not None:
                await audit_svc.log(db, request, teacher, "ACCOUNT_LOCKED")
        # get_db rolls back on an exception, so the lock mirror and the audit
        # row have to be committed before the 401 is raised or neither survives.
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
            headers={"code": "ERR_INVALID_CREDENTIALS"},
        )

    await login_throttle.register_success(db, normalized_email, teacher)

    if needs_rehash(stored_hash):
        teacher.password_hash = await hash_password_async(body.password)

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
        await issue_pending(response, teacher, scope, amr)
        return auth_response(
            teacher,
            "enroll_required" if scope == "enroll" else "factor_required",
            amr,
            [] if scope == "enroll" else await auth_policy.remaining_factors(db, teacher, amr),
        )

    await _issue_session(db, response, teacher, amr)
    return auth_response(teacher, "ok", amr)


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
    clear_auth_cookies(response)
