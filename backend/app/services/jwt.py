"""JWT helpers — encode/decode with explicit algorithm pinning."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import jwt

from app.config import settings

ALGORITHM = settings.JWT_ALGORITHM  # "HS256" — set at startup, never dynamic


def _now_utc() -> datetime:
    return datetime.now(tz=UTC)


# A half-finished sign-in, or an account that has not enrolled enough factors,
# holds a token that authenticates nothing but the next step. Ten minutes is
# long enough to read a code off a phone and short enough that a captured cookie
# is close to worthless.
PENDING_TOKEN_TTL_MINUTES = 10


def create_access_token(
    teacher_id: uuid.UUID,
    email: str,
    role: str,
    *,
    scope: str = "full",
    amr: list[str] | None = None,
    ttl_minutes: int | None = None,
) -> str:
    """
    Return a signed JWT access token.

    *scope* is what `get_current_teacher` enforces:

    * ``full`` — a real session, issued only once two distinct factors have been
      presented.
    * ``auth_pending`` — one factor down, waiting for the next.
    * ``enroll`` — the account has fewer than two factors and may reach only the
      enrollment endpoints.
    * ``reset_pending`` — mid password reset.

    *amr* records which factors earned it, so the second step cannot be
    satisfied by repeating the first.
    """
    from datetime import timedelta

    minutes = ttl_minutes if ttl_minutes is not None else (
        settings.ACCESS_TOKEN_TTL_MINUTES if scope == "full" else PENDING_TOKEN_TTL_MINUTES
    )
    exp = _now_utc() + timedelta(minutes=minutes)
    payload: dict[str, Any] = {
        "sub": str(teacher_id),
        "email": email,
        "role": role,
        "exp": int(exp.timestamp()),
        "iat": int(_now_utc().timestamp()),
        "type": "access",
        "scope": scope,
        "amr": sorted(amr or []),
    }
    if scope != "full":
        # A token that only carries a sign-in forward is single-use: its id is
        # registered when issued and burned when spent, so one captured mid-login
        # cannot be replayed to collect a second factor twice.
        payload["jti"] = str(uuid.uuid4())
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def access_token_ttl_seconds(scope: str) -> int:
    """Cookie lifetime for a token of *scope*, so the two cannot drift apart."""
    minutes = (
        settings.ACCESS_TOKEN_TTL_MINUTES if scope == "full" else PENDING_TOKEN_TTL_MINUTES
    )
    return minutes * 60


def create_refresh_token(teacher_id: uuid.UUID, email: str, role: str) -> tuple[str, str]:
    """
    Return (signed_jwt, jti) for a refresh token valid for REFRESH_TOKEN_TTL_DAYS.

    *jti* is the token's unique ID — stored in DB for revocation.
    """
    from datetime import timedelta

    jti = str(uuid.uuid4())
    exp = _now_utc() + timedelta(days=settings.REFRESH_TOKEN_TTL_DAYS)
    payload = {
        "sub": str(teacher_id),
        "email": email,
        "role": role,
        "exp": int(exp.timestamp()),
        "iat": int(_now_utc().timestamp()),
        "jti": jti,
        "type": "refresh",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM), jti


def decode_token(token: str) -> dict[str, Any]:
    """
    Decode and verify *token*.

    Raises jwt.ExpiredSignatureError, jwt.InvalidTokenError on failure.
    Algorithm is explicitly pinned — prevents algorithm-confusion attacks.
    """
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
