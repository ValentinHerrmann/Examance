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


@pytest.mark.asyncio
async def test_the_challenge_it_issued_is_the_challenge_it_accepts(
    client: AsyncClient, db: AsyncSession
) -> None:
    """
    Round-trip the challenge the client actually echoes back.

    The other tests here post a challenge that was never issued, which is
    refused for the right reason by accident: the stored key was built with
    padded base64url and the options JSON carries the unpadded form, so *every*
    challenge looked unissued and no passkey could ever be registered. A
    negative test cannot see that. This one submits the exact string the browser
    sends and asserts the ceremony gets past the lookup — the verification then
    fails on the deliberately bogus credential, which is a different error.
    """
    await sign_in(client, db, "passkey-roundtrip@example.com")

    options = await client.post("/api/v1/webauthn/register/options")
    assert options.status_code == 200
    challenge = options.json()["challenge_b64"]
    handle = options.json()["handle"]

    body = {
        "handle": handle,
        "challenge_b64": challenge,
        "credential_json": "{}",
        "supports_prf": False,
        "nickname": None,
    }
    first = await client.post("/api/v1/webauthn/register/verify", json=body)
    assert first.status_code == 400
    assert "expired" not in first.json()["detail"].lower(), (
        "the challenge was not found, so the encodings still disagree"
    )

    # And it was spent getting that far: single-use, on the same code path.
    replay = await client.post("/api/v1/webauthn/register/verify", json=body)
    assert replay.status_code == 400
    assert "expired" in replay.json()["detail"].lower()


@pytest.mark.asyncio
async def test_a_passkey_cannot_finish_another_accounts_sign_in(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """
    The two halves of a sign-in must belong to the same account.

    `login_verify` reads the factors already presented off whatever pending
    cookie is attached, and used to trust them whoever the passkey turned out to
    belong to. So proving your own password, then presenting someone else's
    passkey, produced a full session as them on the single factor their
    authenticator provides — the two-of-three rule undone for the account that
    consented to neither step.

    The ceremony is stubbed because it is py_webauthn's and not what is under
    test; a bogus assertion would be rejected before the account check is ever
    reached, and the test would pass without the guard it exists to pin.
    """
    import secrets

    from app.models.webauthn_credential import WebAuthnCredential
    from app.routers import webauthn as webauthn_router
    from app.services import pending_token
    from app.services.jwt import create_access_token, decode_token

    attacker = await create_teacher(db, "passkey-attacker@example.com")
    victim = await create_teacher(db, "passkey-victim@example.com")

    credential = WebAuthnCredential(
        credential_id=secrets.token_bytes(16),
        teacher_id=victim.id,
        public_key=secrets.token_bytes(32),
        sign_count=0,
        prf_salt=secrets.token_bytes(32),
        supports_prf=True,
    )
    db.add(credential)
    await db.commit()

    async def _stub(*_args: object, **_kwargs: object) -> WebAuthnCredential:
        return credential

    monkeypatch.setattr(webauthn_router.webauthn_svc, "verify_authentication", _stub)

    # The attacker's own half-finished sign-in, carrying their proven password.
    token = create_access_token(
        attacker.id, attacker.email, attacker.role, scope="auth_pending", amr=["password"]
    )
    await pending_token.register(decode_token(token).get("jti"))
    client.cookies.set("access_token", token)

    options = await client.post("/api/v1/webauthn/login/options")
    resp = await client.post(
        "/api/v1/webauthn/login/verify",
        json={
            "handle": options.json()["handle"],
            "challenge_b64": options.json()["challenge_b64"],
            "credential_json": "{}",
        },
    )

    assert resp.status_code == 401, resp.text
    assert "refresh_token" not in resp.cookies
