"""
Single-use tracking for sign-in tokens (`auth_pending`, `enroll`, `reset_pending`): the id is
registered at issue and burned when spent, so each token is good for one step. Losing the store
(Redis restart) degrades to the ten-minute expiry; see `ephemeral_store`.
"""
from __future__ import annotations

from app.services import ephemeral_store
from app.services.jwt import PENDING_TOKEN_TTL_MINUTES

_PREFIX = "auth:pending:"
_TTL_SECONDS = PENDING_TOKEN_TTL_MINUTES * 60


async def register(jti: str | None) -> None:
    if jti:
        await ephemeral_store.set(_PREFIX + jti, 1, _TTL_SECONDS)


async def consume(jti: str | None) -> bool:
    """
    Spend a pending token. False when it was already spent or is unknown (e.g. issued before the
    store was reachable): treated as spent, so the caller restarts the sign-in, the safe way to
    fail.
    """
    if not jti:
        return False
    return await ephemeral_store.take(_PREFIX + jti)
