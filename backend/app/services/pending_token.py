"""
Single-use tracking for the tokens that carry a sign-in forward.

An `auth_pending`, `enroll` or `reset_pending` token authenticates nothing but
the next step, and it lives for ten minutes. Within that window a captured one
could otherwise be presented repeatedly. Registering its id when it is issued and
burning the id when it is spent makes each token good for exactly one step.

Losing the store (a Redis restart) degrades to the ten-minute expiry rather than
failing the sign-in — see `ephemeral_store`.
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
    Spend a pending token. False when it was already spent or is unknown.

    A token issued before the store was reachable will read as unknown. That is
    treated as spent rather than valid: the caller simply starts the sign-in
    again, which is the safe direction to fail.
    """
    if not jti:
        return False
    key = _PREFIX + jti
    if await ephemeral_store.get(key) is None:
        return False
    await ephemeral_store.delete(key)
    return True
