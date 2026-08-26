"""
Per-account login throttling with an exponential, capped cooloff.

slowapi's limits (``app/middleware/rate_limit.py``) are keyed on the client IP.
That bounds a spray from one host, but a guesser rotating source addresses is
effectively unthrottled against a single account. This module adds the missing
half: a failure counter keyed on the *account*, and a lock that makes further
attempts cheap to reject.

Two stores are used on purpose:

* Redis holds the rolling failure count, so it is shared across uvicorn workers
  and expires on its own. The key is a SHA-256 of the normalized email, so a
  Redis dump is not a list of who has an account here.
* ``teachers.locked_until`` mirrors the lock, so flushing Redis cannot silently
  clear one and an operator can see the state in the database.

The lock always expires. Any per-account lockout hands an attacker who knows an
email a denial-of-service against its owner, so the cooloff is capped by
``LOGIN_LOCKOUT_MAX_SECONDS`` and is never escalated by attempts made while it
is already in force.
"""
from __future__ import annotations

import hashlib
import time
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.teacher import Teacher
from app.services import ephemeral_store

_FAIL_PREFIX = "login:fail:"
_LOCK_PREFIX = "login:lock:"


def _account_key(email: str) -> str:
    """Hash the normalized email so stored keys are not an account listing."""
    return hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()


def _enabled() -> bool:
    return bool(settings.LOGIN_THROTTLE_ENABLED)


def _cooloff_seconds(failures: int) -> int:
    """
    Exponential cooloff, capped.

    The first lock lands at LOGIN_MAX_FAILED_ATTEMPTS and lasts
    LOGIN_LOCKOUT_BASE_SECONDS; each further failure doubles it up to
    LOGIN_LOCKOUT_MAX_SECONDS.
    """
    over = max(failures - settings.LOGIN_MAX_FAILED_ATTEMPTS, 0)
    # Bound the exponent before shifting so a large counter cannot allocate a
    # huge integer.
    over = min(over, 32)
    seconds: int = settings.LOGIN_LOCKOUT_BASE_SECONDS * (2**over)
    return min(seconds, int(settings.LOGIN_LOCKOUT_MAX_SECONDS))


def _locked_exc(retry_after: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too many failed attempts. Try again later.",
        headers={"code": "ERR_ACCOUNT_LOCKED", "Retry-After": str(max(retry_after, 1))},
    )


async def assert_not_locked(email: str, teacher: Teacher | None = None) -> None:
    """
    Raise 429 when *email* is in a cooloff.

    Called for unknown accounts too, so a locked and an unknown account are not
    distinguishable by response shape or by how much work the server does.
    """
    if not _enabled():
        return

    now = datetime.now(tz=UTC)
    if teacher is not None and teacher.locked_until is not None:
        locked_until = teacher.locked_until
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=UTC)
        if locked_until > now:
            raise _locked_exc(int((locked_until - now).total_seconds()))

    deadline = await ephemeral_store.get(_LOCK_PREFIX + _account_key(email))
    if deadline is not None:
        remaining = deadline - int(time.time())
        if remaining > 0:
            raise _locked_exc(remaining)


async def register_failure(
    db: AsyncSession, email: str, teacher: Teacher | None = None
) -> int | None:
    """
    Count one failed attempt and start a cooloff once the threshold is hit.

    Returns the cooloff in seconds when this attempt caused a lock, else None,
    so the caller can write the ACCOUNT_LOCKED audit entry.
    """
    if not _enabled():
        return None

    key = _account_key(email)
    failures = (await ephemeral_store.get(_FAIL_PREFIX + key) or 0) + 1
    await ephemeral_store.set(_FAIL_PREFIX + key, failures, settings.LOGIN_FAIL_WINDOW_SECONDS)

    if failures < settings.LOGIN_MAX_FAILED_ATTEMPTS:
        return None

    cooloff = _cooloff_seconds(failures)
    await ephemeral_store.set(_LOCK_PREFIX + key, int(time.time()) + cooloff, cooloff)
    if teacher is not None:
        teacher.locked_until = datetime.now(tz=UTC) + timedelta(seconds=cooloff)
        await db.flush()
    return cooloff


async def register_success(
    db: AsyncSession, email: str, teacher: Teacher | None = None
) -> None:
    """Clear the counter and any lock after a factor is presented correctly."""
    if not _enabled():
        return

    key = _account_key(email)
    await ephemeral_store.delete(_FAIL_PREFIX + key, _LOCK_PREFIX + key)
    if teacher is not None and teacher.locked_until is not None:
        teacher.locked_until = None
        await db.flush()


def reset_memory_store() -> None:
    """Drop the in-process fallback store. Test helper."""
    ephemeral_store.reset()
