"""Auth integration tests (login, logout, session security)."""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.teacher import Teacher
from app.services.crypto import hash_password


async def _create_test_teacher(db: AsyncSession, email: str, password: str = "s3cr3t!!-min12") -> Teacher:
    teacher = Teacher(
        email=email,
        password_hash=hash_password(password),
        role="teacher",
    )
    db.add(teacher)
    await db.commit()
    return teacher


@pytest.mark.asyncio
async def test_login_success_and_cookie(client: AsyncClient, db: AsyncSession) -> None:
    await _create_test_teacher(db, "login@example.com", "s3cr3t!!-min12")
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "login@example.com", "password": "s3cr3t!!-min12"},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.cookies
    assert "refresh_token" in resp.cookies
    body = resp.json()
    assert "access_token" not in body  # Never in body
    assert body["email"] == "login@example.com"
    assert body["role"] == "teacher"


@pytest.mark.asyncio
async def test_login_uninitialized_password_is_indistinguishable(
    client: AsyncClient, db: AsyncSession
) -> None:
    """
    An account with no password answers exactly like a wrong password.

    The old ERR_PASSWORD_NOT_SET response told an unauthenticated caller which
    addresses have accounts here. The hint now lives in the reset mail instead.
    """
    teacher = Teacher(email="uninit@example.com", password_hash=None, role="teacher")
    db.add(teacher)
    await db.commit()

    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "uninit@example.com", "password": "s3cr3t!!-min12"},
    )
    unknown = await client.post(
        "/api/v1/auth/login",
        json={"email": "no-such-account@example.com", "password": "s3cr3t!!-min12"},
    )

    assert resp.status_code == 401
    assert resp.headers.get("code") == "ERR_INVALID_CREDENTIALS"
    assert (resp.status_code, resp.json()) == (unknown.status_code, unknown.json())


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, db: AsyncSession) -> None:
    await _create_test_teacher(db, "wrongpw@example.com", "correct-password")
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "wrongpw@example.com", "password": "WRONG-but-long-enough"},
    )
    assert resp.status_code == 401
    assert resp.headers.get("code") == "ERR_INVALID_CREDENTIALS"


@pytest.mark.asyncio
async def test_protected_endpoint_without_cookie(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/exams")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_logout_clears_cookies(client: AsyncClient, db: AsyncSession) -> None:
    await _create_test_teacher(db, "logout@example.com", "s3cr3t!!-min12")
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "logout@example.com", "password": "s3cr3t!!-min12"},
    )
    assert "access_token" in resp.cookies

    client.cookies.update(resp.cookies)
    logout_resp = await client.post("/api/v1/auth/logout")
    assert logout_resp.status_code == 204
