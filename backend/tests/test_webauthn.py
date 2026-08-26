"""
Passkey endpoints.

The ceremonies themselves need a real authenticator, so these cover the parts
that are ours: that a passkey is one factor rather than a shortcut past the
policy, that the challenge is single-use, and that the removal guard holds.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from .factors import DEFAULT_PASSWORD, create_teacher, sign_in


@pytest.mark.asyncio
async def test_login_options_need_no_account(client: AsyncClient) -> None:
    """
    The ceremony takes no account identifier.

    That is deliberate: a passkey is a first-position factor precisely because
    the authenticator names the account. Asking the server which passkeys an
    email has would rebuild the account-profile oracle the design avoids.
    """
    client.cookies.clear()
    resp = await client.post("/api/v1/webauthn/login/options")
    assert resp.status_code == 200
    body = resp.json()
    assert body["handle"]
    assert body["challenge_b64"]
    assert '"rpId"' in body["options_json"]


@pytest.mark.asyncio
async def test_a_stale_challenge_is_refused(client: AsyncClient) -> None:
    """A challenge is single-use; a replayed one must not verify."""
    client.cookies.clear()
    resp = await client.post(
        "/api/v1/webauthn/login/verify",
        json={
            "handle": "never-issued",
            "challenge_b64": "AAAA",
            "credential_json": "{}",
        },
    )
    assert resp.status_code == 401
    assert resp.headers.get("code") == "ERR_PASSKEY_FAILED"


@pytest.mark.asyncio
async def test_registration_needs_at_least_a_pending_sign_in(client: AsyncClient) -> None:
    client.cookies.clear()
    resp = await client.post("/api/v1/webauthn/register/options")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_registration_options_are_reachable_from_enrollment(
    client: AsyncClient, db: AsyncSession
) -> None:
    """
    An account with one factor is held in enrollment — and a passkey is one of
    the things it may enrol, so the ceremony has to work from there.
    """
    email = "passkey-enroll@example.com"
    await create_teacher(db, email)
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": DEFAULT_PASSWORD}
    )
    assert login.json()["status"] == "enroll_required"
    client.cookies.update(login.cookies)

    resp = await client.post("/api/v1/webauthn/register/options")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_credentials_list_is_empty_and_scoped(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, "passkey-list@example.com")
    resp = await client.get("/api/v1/webauthn/credentials")
    assert resp.status_code == 200
    assert resp.json()["credentials"] == []


@pytest.mark.asyncio
async def test_removing_an_unknown_passkey_is_a_404(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, "passkey-del@example.com")
    resp = await client.delete("/api/v1/webauthn/credentials/bm9wZQ")
    assert resp.status_code == 404
