"""Tests for the auth/config hardening controls.

Covers: production SECRET_KEY validation, the registration password policy,
logout cookie clearing, and the CSRF origin backstop.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import PLACEHOLDER_SECRET_KEYS, Settings
from app.models.invite import InviteToken
from app.services.crypto import generate_invite_token, hash_token

STRONG_KEY = "b9f2c1a0" * 8  # 64 chars, stands in for `openssl rand -hex 32`


async def _create_invite(db: AsyncSession) -> str:
    raw = generate_invite_token()
    db.add(
        InviteToken(
            token_hash=hash_token(raw),
            expires_at=datetime.now(tz=timezone.utc) + timedelta(days=7),
        )
    )
    await db.commit()
    return raw


# --- SECRET_KEY validation -------------------------------------------------


@pytest.mark.parametrize("placeholder", sorted(PLACEHOLDER_SECRET_KEYS))
def test_production_rejects_placeholder_secret_key(placeholder: str) -> None:
    with pytest.raises(ValidationError, match="placeholder"):
        Settings(ENVIRONMENT="production", SECRET_KEY=placeholder)


def test_production_rejects_short_secret_key() -> None:
    with pytest.raises(ValidationError, match="at least 32 characters"):
        Settings(ENVIRONMENT="production", SECRET_KEY="too-short")


def test_production_accepts_strong_secret_key() -> None:
    settings = Settings(ENVIRONMENT="production", SECRET_KEY=STRONG_KEY)
    assert settings.SECRET_KEY == STRONG_KEY


def test_development_still_allows_placeholder_secret_key() -> None:
    """Local dev must stay frictionless — the gate is production-only."""
    placeholder = next(iter(PLACEHOLDER_SECRET_KEYS))
    settings = Settings(ENVIRONMENT="development", SECRET_KEY=placeholder)
    assert settings.is_dev


def test_rate_limit_storage_defaults_to_redis_outside_dev() -> None:
    settings = Settings(
        ENVIRONMENT="production",
        SECRET_KEY=STRONG_KEY,
        REDIS_URL="redis://cache:6379/1",
        RATE_LIMIT_STORAGE_URI="",  # unset; conftest exports memory:// for the suite
    )
    assert settings.RATE_LIMIT_STORAGE_URI == "redis://cache:6379/1"


def test_rate_limit_storage_defaults_to_memory_in_dev() -> None:
    settings = Settings(ENVIRONMENT="development", RATE_LIMIT_STORAGE_URI="")
    assert settings.RATE_LIMIT_STORAGE_URI == "memory://"


# --- Registration password policy ------------------------------------------


@pytest.mark.asyncio
async def test_register_rejects_short_password(client: AsyncClient, db: AsyncSession) -> None:
    raw_token = await _create_invite(db)
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "short@example.com", "password": "sh0rt!", "invite_token": raw_token},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_accepts_policy_compliant_password(
    client: AsyncClient, db: AsyncSession
) -> None:
    raw_token = await _create_invite(db)
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "longenough@example.com",
            "password": "twelve-chars-plus",
            "invite_token": raw_token,
        },
    )
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_login_does_not_enforce_a_password_minimum(client: AsyncClient) -> None:
    """A 422 here would tell an attacker the policy applied to a real account."""
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "x"},
    )
    assert resp.status_code == 401


# --- Logout cookie clearing ------------------------------------------------


@pytest.mark.asyncio
async def test_logout_clears_cookies_with_matching_attributes(
    client: AsyncClient, db: AsyncSession
) -> None:
    """
    A SameSite=None cookie deleted without Secure is dropped by the browser,
    leaving the session alive. The delete must repeat the set attributes.
    """
    raw_token = await _create_invite(db)
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "logout-attrs@example.com",
            "password": "twelve-chars-plus",
            "invite_token": raw_token,
        },
    )

    resp = await client.post("/api/v1/auth/logout")
    assert resp.status_code == 204

    set_cookies = resp.headers.get_list("set-cookie")
    assert len(set_cookies) == 2, set_cookies
    for header in set_cookies:
        lowered = header.lower()
        assert "secure" in lowered, header
        assert "samesite=none" in lowered, header
        assert "httponly" in lowered, header


# --- CSRF origin backstop --------------------------------------------------


@pytest.mark.asyncio
async def test_state_changing_request_from_foreign_origin_is_rejected(
    client: AsyncClient,
) -> None:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "victim@example.com", "password": "twelve-chars-plus"},
        headers={"Origin": "https://attacker.example"},
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "ERR_ORIGIN_REJECTED"


@pytest.mark.asyncio
async def test_state_changing_request_from_allowed_origin_passes_guard(
    client: AsyncClient,
) -> None:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "victim@example.com", "password": "twelve-chars-plus"},
        headers={"Origin": "http://localhost:5173"},
    )
    # Reaches the handler; credentials are wrong, so 401 rather than 403.
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_regex_allowed_origin_passes_guard(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "victim@example.com", "password": "twelve-chars-plus"},
        headers={"Origin": "https://exams.valentin-herrmann.com"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_origin_regex_is_not_suffix_extendable(client: AsyncClient) -> None:
    """`https://x.valentin-herrmann.com.attacker.test` must not match."""
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "victim@example.com", "password": "twelve-chars-plus"},
        headers={"Origin": "https://x.valentin-herrmann.com.attacker.test"},
    )
    assert resp.status_code == 403


# --- Body size limit -------------------------------------------------------


@pytest.mark.asyncio
async def test_oversized_body_rejected_by_content_length(client: AsyncClient) -> None:
    from app.config import settings

    resp = await client.post(
        "/api/v1/compile/latex",
        content=b"x" * (settings.BODY_LIMIT_COMPILE + 1),
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 413
    assert resp.json()["code"] == "ERR_PAYLOAD_TOO_LARGE"


@pytest.mark.asyncio
async def test_oversized_chunked_body_rejected(client: AsyncClient) -> None:
    """
    A chunked request carries no Content-Length, so the header check alone
    would let an unbounded body stream straight into memory.
    """
    from app.config import settings

    chunk = b"x" * 64_000
    chunks = (settings.BODY_LIMIT_COMPILE // len(chunk)) + 4

    async def body_stream():
        for _ in range(chunks):
            yield chunk

    resp = await client.post(
        "/api/v1/compile/latex",
        content=body_stream(),
        headers={"Content-Type": "application/json"},
    )
    assert "content-length" not in {k.lower() for k in resp.request.headers}
    assert resp.status_code == 413, resp.status_code


@pytest.mark.asyncio
async def test_malformed_content_length_is_a_400_not_a_500(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/compile/latex",
        content=b"{}",
        headers={"Content-Type": "application/json", "Content-Length": "not-a-number"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_requests_without_origin_are_allowed(client: AsyncClient) -> None:
    """Non-browser clients (CLI, server-to-server) send no Origin header."""
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "victim@example.com", "password": "twelve-chars-plus"},
    )
    assert resp.status_code == 401
