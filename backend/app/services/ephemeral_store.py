"""
Short-lived shared counters and markers.

Redis where one is configured, an in-process dict otherwise. Everything stored
here expires on its own and is safe to lose: a lost login-failure counter means
an attacker gets a few more attempts, a lost single-use marker means a pending
token could be replayed inside its ten-minute window. Both are bounded, which is
why an unreachable Redis degrades rather than fails the request — a throttle that
can take the login endpoint down with it is worse than the attack it prevents.

Keys are hashed by callers where they would otherwise be personal data.
"""
from __future__ import annotations

import logging
import time

from app.config import settings

logger = logging.getLogger(__name__)

# Fallback store: key -> (value, expiry as monotonic seconds).
_memory: dict[str, tuple[int, float]] = {}


def uses_redis() -> bool:
    uri = settings.RATE_LIMIT_STORAGE_URI
    return uri.startswith("redis://") or uri.startswith("rediss://")


async def get(key: str) -> int | None:
    """The stored integer for *key*, or None when absent or expired."""
    if uses_redis():
        try:
            from redis.asyncio import Redis

            client: Redis = Redis.from_url(settings.RATE_LIMIT_STORAGE_URI)
            try:
                raw = await client.get(key)
            finally:
                await client.aclose()
            return int(raw) if raw is not None else None
        except Exception:  # noqa: BLE001 - degrade, never break the request
            logger.warning("Ephemeral store: Redis unavailable, using in-process store.")

    entry = _memory.get(key)
    if entry is None:
        return None
    value, expires_at = entry
    if expires_at <= time.monotonic():
        _memory.pop(key, None)
        return None
    return value


async def set(key: str, value: int, ttl_seconds: int) -> None:  # noqa: A001 - mirrors Redis
    if uses_redis():
        try:
            from redis.asyncio import Redis

            client: Redis = Redis.from_url(settings.RATE_LIMIT_STORAGE_URI)
            try:
                await client.set(key, value, ex=max(ttl_seconds, 1))
            finally:
                await client.aclose()
            return
        except Exception:  # noqa: BLE001 - degrade, never break the request
            logger.warning("Ephemeral store: Redis unavailable, using in-process store.")

    _memory[key] = (value, time.monotonic() + max(ttl_seconds, 1))


async def delete(*keys: str) -> None:
    if uses_redis():
        try:
            from redis.asyncio import Redis

            client: Redis = Redis.from_url(settings.RATE_LIMIT_STORAGE_URI)
            try:
                await client.delete(*keys)
            finally:
                await client.aclose()
        except Exception:  # noqa: BLE001 - degrade, never break the request
            logger.warning("Ephemeral store: Redis unavailable, using in-process store.")

    for key in keys:
        _memory.pop(key, None)


def reset() -> None:
    """Drop the in-process fallback store. Test helper."""
    _memory.clear()
