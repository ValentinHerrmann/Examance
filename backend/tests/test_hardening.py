"""Tests for the auth/config hardening controls.

Covers: production SECRET_KEY validation, the registration password policy,
logout cookie clearing, and the CSRF origin backstop.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re

import pytest
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import PLACEHOLDER_SECRET_KEYS, Settings
from app.models.teacher import Teacher
from app.services.crypto import hash_password

STRONG_KEY = "b9f2c1a0" * 8  # 64 chars, stands in for `openssl rand -hex 32`


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


def test_effective_cors_origin_regex_in_dev() -> None:
    settings = Settings(_env_file=None, ENVIRONMENT="development")
    assert settings.effective_cors_origin_regex is not None
    pattern = re.compile(settings.effective_cors_origin_regex)
    assert pattern.fullmatch("http://localhost:8000")
    assert pattern.fullmatch("http://127.0.0.1:9999")
    assert pattern.fullmatch("https://sub.valentin-herrmann.com")
    assert pattern.fullmatch("https://claude-fullstack.examance.pages.dev")
    assert not pattern.fullmatch("https://attacker.com")


def test_effective_cors_origin_regex_in_production() -> None:
    settings = Settings(_env_file=None, ENVIRONMENT="production", SECRET_KEY=STRONG_KEY)
    assert settings.effective_cors_origin_regex is not None
    pattern = re.compile(settings.effective_cors_origin_regex)
    assert not pattern.fullmatch("http://localhost:8000")
    assert not pattern.fullmatch("http://127.0.0.1:9999")
    assert pattern.fullmatch("https://sub.valentin-herrmann.com")
    assert pattern.fullmatch("https://claude-fullstack.examance.pages.dev")
    assert not pattern.fullmatch("https://attacker.com")


def test_production_rejects_short_initial_admin_password() -> None:
    with pytest.raises(ValidationError, match="at least 12 characters"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY=STRONG_KEY,
            INITIAL_ADMIN_PASSWORD="too-short",
        )


# --- FRONTEND_URL / email link validation -----------------------------------


def test_production_rejects_blocklisted_frontend_url_when_smtp_configured() -> None:
    """Reset links on *.pages.dev get the mail bounced by relays with a (B-URL) rule."""
    with pytest.raises(ValidationError, match="blocklists"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY=STRONG_KEY,
            SMTP_HOST="mail.example.com",
            FRONTEND_URL="https://prev-examance.valentin-herrmann.com/",
        )


def test_blocklisted_frontend_url_allowed_without_smtp() -> None:
    """No SMTP host means no mail is sent, so the link domain cannot bounce anything."""
    settings = Settings(
        ENVIRONMENT="production",
        SECRET_KEY=STRONG_KEY,
        FRONTEND_URL="https://prev-examance.valentin-herrmann.com/",
    )
    assert settings.FRONTEND_URL == "https://prev-examance.valentin-herrmann.com/"


def test_development_allows_blocklisted_frontend_url() -> None:
    settings = Settings(
        ENVIRONMENT="development",
        SMTP_HOST="mail.example.com",
        FRONTEND_URL="https://prev-examance.valentin-herrmann.com/",
    )
    assert settings.SMTP_HOST == "mail.example.com"


def test_custom_domain_frontend_url_accepted_with_smtp() -> None:
    settings = Settings(
        ENVIRONMENT="production",
        SECRET_KEY=STRONG_KEY,
        SMTP_HOST="mail.example.com",
        FRONTEND_URL="https://preview.examance.valentin-herrmann.com/",
    )
    assert settings.FRONTEND_URL.endswith("valentin-herrmann.com/")


def test_blocklist_matches_only_on_domain_boundary() -> None:
    """'mypages.dev' merely ends in the same letters — it must not be blocked."""
    settings = Settings(
        ENVIRONMENT="production",
        SECRET_KEY=STRONG_KEY,
        SMTP_HOST="mail.example.com",
        FRONTEND_URL="https://mypages.dev/",
    )
    assert settings.FRONTEND_URL == "https://mypages.dev/"


# --- Password policy --------------------------------------------------------


@pytest.mark.asyncio
async def test_reset_password_rejects_short_password(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": "some-token", "new_password": "sh0rt!"},
    )
    assert resp.status_code == 422


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
    teacher = Teacher(
        email="logout-attrs@example.com",
        password_hash=hash_password("twelve-chars-plus"),
        role="teacher",
    )
    db.add(teacher)
    await db.commit()

    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "logout-attrs@example.com", "password": "twelve-chars-plus"},
    )
    client.cookies.update(login_resp.cookies)

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
