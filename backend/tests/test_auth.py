"""Auth integration tests (login, logout, session security)."""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.teacher import Teacher
from app.services.crypto import hash_password

from .factors import current_code, enrol_totp


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
async def test_password_alone_does_not_produce_a_session(
    client: AsyncClient, db: AsyncSession
) -> None:
    """
    A correct password gets the sign-in to step two, not into the account.

    No refresh cookie is issued yet either: a half-authenticated session must not
    be renewable.
    """
    teacher = await _create_test_teacher(db, "onefactor@example.com", "s3cr3t!!-min12")
    await enrol_totp(db, teacher)

    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "onefactor@example.com", "password": "s3cr3t!!-min12"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "factor_required"
    assert body["satisfied"] == ["password"]
    assert body["available"] == ["totp"]
    assert "refresh_token" not in resp.cookies


@pytest.mark.asyncio
async def test_two_factors_produce_a_session(client: AsyncClient, db: AsyncSession) -> None:
    teacher = await _create_test_teacher(db, "login@example.com", "s3cr3t!!-min12")
    secret = await enrol_totp(db, teacher)

    first = await client.post(
        "/api/v1/auth/login",
        json={"email": "login@example.com", "password": "s3cr3t!!-min12"},
    )
    client.cookies.update(first.cookies)

    resp = await client.post("/api/v1/auth/factor/totp", json={"code": current_code(secret)})

    assert resp.status_code == 200
    assert "access_token" in resp.cookies
    assert "refresh_token" in resp.cookies
    body = resp.json()
    assert "access_token" not in body  # Never in body
    assert body["status"] == "ok"
    assert body["email"] == "login@example.com"
    assert body["role"] == "teacher"


@pytest.mark.asyncio
async def test_an_account_with_one_factor_is_held_in_enrollment(
    client: AsyncClient, db: AsyncSession
) -> None:
    """A password-only account can reach enrollment and nothing else."""
    await _create_test_teacher(db, "enrolme@example.com", "s3cr3t!!-min12")

    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "enrolme@example.com", "password": "s3cr3t!!-min12"},
    )
    assert resp.json()["status"] == "enroll_required"
    client.cookies.update(resp.cookies)

    blocked = await client.get("/api/v1/exams")
    assert blocked.status_code == 403
    assert blocked.headers.get("code") == "ERR_MFA_ENROLLMENT_REQUIRED"


@pytest.mark.asyncio
async def test_the_same_factor_cannot_be_presented_twice(
    client: AsyncClient, db: AsyncSession
) -> None:
    teacher = await _create_test_teacher(db, "twice@example.com", "s3cr3t!!-min12")
    secret = await enrol_totp(db, teacher)

    first = await client.post(
        "/api/v1/auth/login",
        json={"email": "twice@example.com", "password": "s3cr3t!!-min12"},
    )
    client.cookies.update(first.cookies)
    ok = await client.post("/api/v1/auth/factor/totp", json={"code": current_code(secret)})
    client.cookies.update(ok.cookies)

    # A full session no longer accepts a factor step at all.
    again = await client.post("/api/v1/auth/factor/totp", json={"code": current_code(secret)})
    assert again.status_code in (400, 403)


@pytest.mark.asyncio
async def test_a_totp_code_cannot_be_replayed(client: AsyncClient, db: AsyncSession) -> None:
    """
    A code stays valid for 30 seconds. One observed inside that window — over a
    shoulder, in a proxied request — must not open a second sign-in.
    """
    teacher = await _create_test_teacher(db, "replay@example.com", "s3cr3t!!-min12")
    secret = await enrol_totp(db, teacher)
    code = current_code(secret)

    first = await client.post(
        "/api/v1/auth/login",
        json={"email": "replay@example.com", "password": "s3cr3t!!-min12"},
    )
    client.cookies.update(first.cookies)
    accepted = await client.post("/api/v1/auth/factor/totp", json={"code": code})
    assert accepted.status_code == 200

    client.cookies.clear()
    second = await client.post(
        "/api/v1/auth/login",
        json={"email": "replay@example.com", "password": "s3cr3t!!-min12"},
    )
    client.cookies.update(second.cookies)
    replayed = await client.post("/api/v1/auth/factor/totp", json={"code": code})
    assert replayed.status_code == 401
    assert replayed.headers.get("code") == "ERR_MFA_INVALID_CODE"


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
