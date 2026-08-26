"""Per-account login cooloff.

The suite runs with RATE_LIMIT_ENABLED=false (see conftest), which also switches
the throttle off by default, so each test enables it explicitly and restores the
previous setting afterwards.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.teacher import Teacher
from app.services import login_throttle
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
