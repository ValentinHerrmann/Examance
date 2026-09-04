"""Per-account login cooloff.

The suite runs with RATE_LIMIT_ENABLED=false (see conftest), which also switches
the throttle off by default, so each test enables it explicitly and restores the
previous setting afterwards.
"""
from __future__ import annotations

import time
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.teacher import Teacher
from app.services import ephemeral_store, login_throttle
from app.services.crypto import hash_password

_PASSWORD = "s3cr3t!!-min12"  # noqa: S105 - test fixture credential


@pytest_asyncio.fixture
async def throttling() -> AsyncGenerator[None, None]:
    previous = settings.LOGIN_THROTTLE_ENABLED
    previous_max = settings.LOGIN_MAX_FAILED_ATTEMPTS
    settings.LOGIN_THROTTLE_ENABLED = True
    settings.LOGIN_MAX_FAILED_ATTEMPTS = 3
    login_throttle.reset_memory_store()
    yield
    settings.LOGIN_THROTTLE_ENABLED = previous
    settings.LOGIN_MAX_FAILED_ATTEMPTS = previous_max
    login_throttle.reset_memory_store()


async def _create_teacher(db: AsyncSession, email: str) -> Teacher:
    teacher = Teacher(email=email, password_hash=hash_password(_PASSWORD), role="teacher")
    db.add(teacher)
    await db.commit()
    return teacher


async def _fail_login(client: AsyncClient, email: str) -> int:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "definitely-the-wrong-one"},
    )
    return resp.status_code


@pytest.mark.asyncio
async def test_repeated_failures_lock_the_account(
    client: AsyncClient, db: AsyncSession, throttling: None
) -> None:
    email = "lockme@example.com"
    await _create_teacher(db, email)

    for _ in range(settings.LOGIN_MAX_FAILED_ATTEMPTS):
        assert await _fail_login(client, email) == 401

    resp = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": _PASSWORD}
    )
    assert resp.status_code == 429
    assert resp.headers.get("code") == "ERR_ACCOUNT_LOCKED"
    assert int(resp.headers["Retry-After"]) > 0


@pytest.mark.asyncio
async def test_lock_is_mirrored_on_the_teacher_row(
    client: AsyncClient, db: AsyncSession, throttling: None
) -> None:
    email = "mirror@example.com"
    await _create_teacher(db, email)

    for _ in range(settings.LOGIN_MAX_FAILED_ATTEMPTS):
        await _fail_login(client, email)

    result = await db.execute(select(Teacher).where(Teacher.email == email))
    teacher = result.scalar_one()
    await db.refresh(teacher)
    assert teacher.locked_until is not None


@pytest.mark.asyncio
async def test_success_clears_the_counter(
    client: AsyncClient, db: AsyncSession, throttling: None
) -> None:
    email = "clearme@example.com"
    await _create_teacher(db, email)

    for _ in range(settings.LOGIN_MAX_FAILED_ATTEMPTS - 1):
        assert await _fail_login(client, email) == 401

    ok = await client.post("/api/v1/auth/login", json={"email": email, "password": _PASSWORD})
    assert ok.status_code == 200

    # The counter was reset, so a fresh run of failures is needed to lock again.
    for _ in range(settings.LOGIN_MAX_FAILED_ATTEMPTS - 1):
        assert await _fail_login(client, email) == 401


@pytest.mark.asyncio
async def test_unknown_account_is_throttled_the_same_way(
    client: AsyncClient, throttling: None
) -> None:
    """A locked account and an unknown one must not be distinguishable."""
    email = "ghost@example.com"
    for _ in range(settings.LOGIN_MAX_FAILED_ATTEMPTS):
        assert await _fail_login(client, email) == 401

    resp = await _fail_login(client, email)
    assert resp == 429


@pytest.mark.asyncio
async def test_an_unreachable_redis_does_not_stall_the_login(
    client: AsyncClient, db: AsyncSession, throttling: None
) -> None:
    """
    The throttle must fail fast, not hang.

    `Redis.from_url()` leaves `socket_connect_timeout` unset, so redis-py falls
    back to the OS TCP connect timeout — roughly two minutes on Linux. With the
    throttle on the login path that turned a misconfigured Redis into a sign-in
    that blocked until the browser gave up and reported the server unreachable,
    which is a far worse outcome than the guessing this prevents.

    Port 1 on the loopback address refuses fast on most hosts and black-holes on
    the rest; either way the deadline below is what has to hold.
    """
    email = "redis-down@example.com"
    await _create_teacher(db, email)

    previous_uri = settings.RATE_LIMIT_STORAGE_URI
    settings.RATE_LIMIT_STORAGE_URI = "redis://192.0.2.1:6379/0"  # TEST-NET-1, unroutable
    ephemeral_store.reset()
    try:
        started = time.monotonic()
        resp = await client.post(
            "/api/v1/auth/login", json={"email": email, "password": _PASSWORD}
        )
        elapsed = time.monotonic() - started

        # The request still succeeds — the in-process store carries it.
        assert resp.status_code == 200
        # Comfortably inside the frontend's 25s abort, and nowhere near the
        # ~130s an unbounded connect would take.
        assert elapsed < 10, f"login took {elapsed:.1f}s with Redis unreachable"
    finally:
        settings.RATE_LIMIT_STORAGE_URI = previous_uri
        ephemeral_store.reset()


@pytest.mark.asyncio
async def test_the_circuit_breaker_stops_retrying_a_dead_redis(
    client: AsyncClient, db: AsyncSession, throttling: None
) -> None:
    """One outage should cost one timeout, not one per request."""
    email = "redis-down-twice@example.com"
    await _create_teacher(db, email)

    previous_uri = settings.RATE_LIMIT_STORAGE_URI
    settings.RATE_LIMIT_STORAGE_URI = "redis://192.0.2.1:6379/0"
    ephemeral_store.reset()
    try:
        await client.post("/api/v1/auth/login", json={"email": email, "password": _PASSWORD})

        started = time.monotonic()
        await client.post("/api/v1/auth/login", json={"email": email, "password": _PASSWORD})
        elapsed = time.monotonic() - started

        # Second attempt skips Redis entirely while the circuit is open.
        assert elapsed < 2, f"second login took {elapsed:.1f}s; circuit did not open"
    finally:
        settings.RATE_LIMIT_STORAGE_URI = previous_uri
        ephemeral_store.reset()
