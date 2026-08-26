"""
Short-lived shared counters and markers.

Redis where one is configured, an in-process dict otherwise. Everything stored
here expires on its own and is safe to lose: a lost login-failure counter means
an attacker gets a few more attempts, a lost single-use marker means a pending
token could be replayed inside its ten-minute window. Both are bounded.

**This runs on the login path, so it must fail fast.** The first version did not:
`Redis.from_url()` leaves `socket_connect_timeout` unset, so redis-py inherits
the OS TCP connect timeout — around 130 seconds on Linux. A misconfigured or
unreachable Redis therefore did not degrade, it hung, and every sign-in blocked
until the browser gave up at 25 seconds and reported the server as unreachable.
That is a worse failure than the attack the throttle prevents.

Three things keep that from recurring:

* explicit connect and operation timeouts, so an unreachable Redis costs a
  fraction of a second rather than minutes;
* `asyncio.wait_for` as a hard outer bound, since a socket timeout does not cover
  a server that accepts the connection and then stalls;
* a circuit breaker, so one failure does not make every subsequent request pay
  the timeout again.

Keys are hashed by callers where they would otherwise be personal data.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Any

from app.config import settings

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

# Fallback store: key -> (value, expiry as monotonic seconds).
_memory: dict[str, tuple[int, float]] = {}

# Redis is a cache in front of a fallback that always works, so these are set to
# "answer quickly or get out of the way" rather than to ride out a blip.
_CONNECT_TIMEOUT_SECONDS = 0.5
_OPERATION_TIMEOUT_SECONDS = 0.5
# Outer bound. Covers the case a socket timeout does not: a peer that completes
# the TCP handshake and then never answers.
_DEADLINE_SECONDS = 1.0
# How long to stop trying after a failure. Long enough that a sustained outage
# costs one timeout per minute rather than one per request.
_CIRCUIT_OPEN_SECONDS = 60.0

_client: Redis[bytes] | None = None
_circuit_open_until = 0.0


def uses_redis() -> bool:
    uri = settings.RATE_LIMIT_STORAGE_URI
    return uri.startswith("redis://") or uri.startswith("rediss://")


def _circuit_is_open() -> bool:
    return time.monotonic() < _circuit_open_until


def _trip_circuit(exc: BaseException) -> None:
    global _circuit_open_until
    _circuit_open_until = time.monotonic() + _CIRCUIT_OPEN_SECONDS
    logger.warning(
        "Ephemeral store: Redis unavailable (%s). Falling back to the in-process "
        "store and not retrying for %.0fs.",
        exc.__class__.__name__,
        _CIRCUIT_OPEN_SECONDS,
    )


def _get_client() -> Redis[bytes] | None:
    """One client for the process. Reconnection is redis-py's problem, not ours."""
    global _client
    if _client is None:
        try:
            from redis.asyncio import Redis

            _client = Redis.from_url(
                settings.RATE_LIMIT_STORAGE_URI,
                socket_connect_timeout=_CONNECT_TIMEOUT_SECONDS,
                socket_timeout=_OPERATION_TIMEOUT_SECONDS,
            )
        except Exception as exc:  # noqa: BLE001 - degrade, never break the request
            _trip_circuit(exc)
            return None
    return _client


async def _call(operation: str, *args: Any) -> Any | None:
    """
    Run one Redis command, or give up quickly.

    Returns None both when Redis is unusable and when the command legitimately
    returned nothing; callers treat the two the same, which is what makes losing
    the store safe.
    """
    if not uses_redis() or _circuit_is_open():
        return None
    client = _get_client()
    if client is None:
        return None
    try:
        return await asyncio.wait_for(
            getattr(client, operation)(*args), timeout=_DEADLINE_SECONDS
        )
    except Exception as exc:  # noqa: BLE001 - degrade, never break the request
        _trip_circuit(exc)
        return None


async def get(key: str) -> int | None:
    """The stored integer for *key*, or None when absent or expired."""
    raw = await _call("get", key)
    if raw is not None:
        try:
            return int(raw)
        except (TypeError, ValueError):
            return None

    entry = _memory.get(key)
    if entry is None:
        return None
    value, expires_at = entry
    if expires_at <= time.monotonic():
        _memory.pop(key, None)
        return None
    return value


async def set(key: str, value: int, ttl_seconds: int) -> None:  # noqa: A001 - mirrors Redis
    """
    Store *value* under *key*.

    Written to both stores rather than one: if Redis is reachable now but not on
    the read, the in-process copy still answers on this worker.
    """
    ttl = max(ttl_seconds, 1)
    await _call("set", key, value, ttl)
    _memory[key] = (value, time.monotonic() + ttl)


async def delete(*keys: str) -> None:
    if keys:
        await _call("delete", *keys)
    for key in keys:
        _memory.pop(key, None)


def reset() -> None:
    """Drop the in-process fallback store and the circuit state. Test helper."""
    global _circuit_open_until
    _memory.clear()
    _circuit_open_until = 0.0


async def check_reachable() -> bool:
    """
    Probe the configured store once, for a startup log line.

    Worth doing because the failure this guards against is otherwise invisible:
    a misconfigured REDIS_URL degrades silently to per-process counters, and the
    only outward sign is that throttling stops being shared across workers. Note
    the default is ``redis://localhost:6379/0``, which inside a container points
    at the container itself.
    """
    if not uses_redis():
        return False
    reset()
    return await _call("ping") is not None
