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


# A pending token authenticates only the next step. Ten minutes is long enough to read a code
# off a phone and short enough that a captured cookie is close to worthless.
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
    Return a signed JWT access token. *scope* is what `get_current_teacher` enforces: ``full`` (two
    distinct factors presented), ``auth_pending``, ``enroll`` (enrollment endpoints only),
    ``reset_pending``. *amr* records the factors that earned it, so step two cannot repeat step one.
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


def create_refresh_token(
    teacher_id: uuid.UUID, email: str, role: str, *, amr: list[str] | None = None
) -> tuple[str, str]:
    """
    Return (signed_jwt, jti) for a refresh token valid for REFRESH_TOKEN_TTL_DAYS; *jti* is stored
    for revocation. *amr* is carried here, not inferred at refresh: assuming "full" would turn a
    half-finished sign-in into a complete session.
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
        "amr": sorted(amr or []),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM), jti


def decode_token(token: str) -> dict[str, Any]:
    """
    Decode and verify *token*.

    Raises jwt.ExpiredSignatureError, jwt.InvalidTokenError on failure.
    Algorithm is explicitly pinned — prevents algorithm-confusion attacks.
    """
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
