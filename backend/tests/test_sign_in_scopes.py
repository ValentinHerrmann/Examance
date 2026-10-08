"""
What a half-finished sign-in or a reset may do: read, but never add factors or rewrite key wraps.

Also the reset-token binding, refresh-token reuse detection and single-use markers.
"""
from __future__ import annotations

import base64
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.password_reset_token import PasswordResetToken
from app.models.refresh_token import RefreshToken
from app.services import ephemeral_store
from app.services.jwt import create_refresh_token, decode_token
from app.services.password_reset import create_and_send_reset_token

from .factors import DEFAULT_PASSWORD, create_teacher, enrol_totp, start_reset


def _b64(value: bytes) -> str:
    return base64.b64encode(value).decode()


_ENVELOPE_SET = {
    "key_id_b64": _b64(b"\x09" * 16),
    "envelope_version": 1,
    "envelopes": [
        {
            "kind": "recovery",
            "credential_id_b64": None,
            "kdf": "argon2id",
            "kdf_salt_b64": _b64(bytes(range(16))),
            "kdf_params": {"t": 3, "m": 65536, "p": 4},
            "wrapped_bundle_b64": _b64(b"\x05" * 120),
            "wrap_iv_b64": _b64(bytes(range(12))),
        }
    ],
}


@pytest.mark.asyncio
async def test_a_pending_sign_in_cannot_add_factors_or_rewrite_keys(
    client: AsyncClient, db: AsyncSession
) -> None:
    """One proven factor must not enrol another one, or replace the wraps of the data key."""
    teacher = await create_teacher(db, "pending-scope@example.com")
    await enrol_totp(db, teacher)

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "pending-scope@example.com", "password": DEFAULT_PASSWORD},
    )
    assert login.json()["status"] == "factor_required"
    client.cookies.update(login.cookies)

    assert (await client.post("/api/v1/mfa/totp/enroll")).status_code == 403
    assert (await client.post("/api/v1/webauthn/register/options")).status_code == 403
    assert (await client.put("/api/v1/keys/envelopes", json=_ENVELOPE_SET)).status_code == 403

    # Reads stay available: the factor chooser and vault prompts need them.
    assert (await client.get("/api/v1/keys/envelopes")).status_code == 200
    assert (await client.get("/api/v1/mfa/status")).status_code == 200


@pytest.mark.asyncio
async def test_a_reset_session_reads_but_cannot_rewrite_keys(
    client: AsyncClient, db: AsyncSession
) -> None:
    """The reset stores its new set inside /auth/reset-password, never through PUT."""
    teacher = await create_teacher(db, "reset-scope@example.com")
    await enrol_totp(db, teacher)
    raw_token, _ = await create_and_send_reset_token(db, teacher)

    step = await start_reset(client, raw_token)
    assert step["status"] == "factor_required"

    assert (await client.put("/api/v1/keys/envelopes", json=_ENVELOPE_SET)).status_code == 403
    assert (await client.get("/api/v1/keys/envelopes")).status_code == 200


@pytest.mark.asyncio
async def test_a_reset_session_cannot_spend_another_accounts_token(
    client: AsyncClient, db: AsyncSession
) -> None:
    """The second factor was proven for the session's account, so the token must be its own."""
    attacker = await create_teacher(db, "reset-attacker@example.com")
    victim = await create_teacher(db, "reset-victim@example.com")
    await enrol_totp(db, victim)
    attacker_token, _ = await create_and_send_reset_token(db, attacker)
    victim_token, _ = await create_and_send_reset_token(db, victim)

    await start_reset(client, attacker_token)
    resp = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": victim_token, "new_password": "TakenOver123456!"},
    )
    assert resp.status_code == 400
    assert resp.headers.get("code") == "ERR_INVALID_TOKEN"

    used_at = (
        await db.execute(
            select(PasswordResetToken.used_at).where(
                PasswordResetToken.teacher_id == victim.id
            )
        )
    ).scalar_one()
    assert used_at is None

    client.cookies.clear()
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "reset-victim@example.com", "password": DEFAULT_PASSWORD},
    )
    assert login.json()["status"] == "factor_required"


@pytest.mark.asyncio
async def test_reusing_a_revoked_refresh_token_revokes_every_session(
    client: AsyncClient, db: AsyncSession
) -> None:
    """The theft response must outlive the 401 it answers with (get_db rolls back on errors)."""
    teacher = await create_teacher(db, "refresh-theft@example.com")
    await enrol_totp(db, teacher)

    def _row(token: str, jti: str, *, revoked: bool) -> RefreshToken:
        return RefreshToken(
            jti=jti,
            teacher_id=teacher.id,
            revoked=revoked,
            expires_at=datetime.fromtimestamp(decode_token(token)["exp"], tz=UTC),
        )

    stolen, stolen_jti = create_refresh_token(
        teacher.id, teacher.email, teacher.role, amr=["password", "totp"]
    )
    live, live_jti = create_refresh_token(
        teacher.id, teacher.email, teacher.role, amr=["password", "totp"]
    )
    db.add(_row(stolen, stolen_jti, revoked=True))
    db.add(_row(live, live_jti, revoked=False))
    await db.commit()

    client.cookies.set("refresh_token", stolen)
    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 401

    revoked = (
        await db.execute(select(RefreshToken.revoked).where(RefreshToken.jti == live_jti))
    ).scalar_one()
    assert revoked is True


@pytest.mark.asyncio
async def test_a_single_use_marker_is_spent_once() -> None:
    ephemeral_store.reset()
    await ephemeral_store.set("test:marker", 1, 60)

    assert await ephemeral_store.take("test:marker") is True
    assert await ephemeral_store.take("test:marker") is False
    assert await ephemeral_store.take("test:never-set") is False
