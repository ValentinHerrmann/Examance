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
from app.dependencies import get_current_teacher
from app.middleware.rate_limit import limiter
from app.models.refresh_token import RefreshToken
from app.models.teacher import Teacher
from app.schemas.auth import AuthResponse, ForgotPasswordRequest, LoginRequest, ResetPasswordRequest
from app.services import audit as audit_svc
from app.services.crypto import hash_password, needs_rehash, verify_password
from app.services.jwt import create_access_token, create_refresh_token, decode_token
from app.services.password_reset import complete_password_reset, create_and_send_reset_token

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
    response.set_cookie(ACCESS_COOKIE, access_token, max_age=15 * 60, **_COOKIE_KWARGS)  # type: ignore[arg-type]
    response.set_cookie(
        REFRESH_COOKIE,
        refresh_token,
        max_age=refresh_max_age,
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


@router.post("/reset-password", status_code=status.HTTP_200_OK)
@limiter.limit("5/hour")
async def reset_password(
    body: ResetPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """
    Set a new password using a valid single-use reset token.
    """
    try:
        teacher = await complete_password_reset(db, body.token, body.new_password)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err),
            headers={"code": "ERR_INVALID_TOKEN"},
        ) from err

    await audit_svc.write(
        db,
        teacher_id=teacher.id,
        teacher_email=teacher.email,
        action="PASSWORD_RESET_COMPLETED",
        request_ip=request.client.host if request.client else None,
    )

    return {"message": "Password has been successfully set. You can now log in."}


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

    stored_hash = teacher.password_hash if teacher else None

    if teacher and stored_hash is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Password has not been set for this account. "
                "Please set a password using the link sent to your email."
            ),
            headers={"code": "ERR_PASSWORD_NOT_SET"},
        )

    # Constant-time: always call verify_password even if teacher not found
    dummy_hash = "$argon2id$v=19$m=65536,t=3,p=4$fakesaltfakesalt$fakehashfakehashfakehashfakehash"
    password_ok = verify_password(body.password, stored_hash if stored_hash else dummy_hash)

    if not teacher or stored_hash is None or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
            headers={"code": "ERR_INVALID_CREDENTIALS"},
        )

    # Rehash if parameters changed
    if needs_rehash(stored_hash):
        teacher.password_hash = hash_password(body.password)

    access_token = create_access_token(teacher.id, teacher.email, teacher.role)
    refresh_jwt, jti = create_refresh_token(teacher.id, teacher.email, teacher.role)

    decoded = decode_token(refresh_jwt)
    rt = RefreshToken(
        jti=jti,
        teacher_id=teacher.id,
        expires_at=datetime.fromtimestamp(decoded["exp"], tz=UTC),
    )
    db.add(rt)

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
    return AuthResponse(email=teacher.email, role=teacher.role)


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

    # Issue new tokens
    new_access = create_access_token(teacher.id, teacher.email, teacher.role)
    new_refresh_jwt, new_jti = create_refresh_token(teacher.id, teacher.email, teacher.role)
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
    return AuthResponse(email=teacher.email, role=teacher.role)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    _teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Clear auth cookies and revoke refresh token."""
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
