"""Key-envelope endpoints.

The server must never be able to unwrap anything it stores here, and a partially
written envelope set is a locked-out teacher, so replacement is wholesale.
"""
from __future__ import annotations

import base64

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from .factors import sign_in

_PASSWORD = "s3cr3t!!-min12"  # noqa: S105 - test fixture credential


async def _login(client: AsyncClient, db: AsyncSession, email: str) -> None:
    # Two factors, because one no longer produces a session. See tests/factors.py.
    await sign_in(client, db, email, password=_PASSWORD)


def _b64(value: bytes) -> str:
    return base64.b64encode(value).decode()


def _envelope(kind: str, *, credential_id: bytes | None = None) -> dict[str, object]:
    return {
        "kind": kind,
        "credential_id_b64": _b64(credential_id) if credential_id else None,
        "kdf": "argon2id" if kind != "passkey" else "hkdf",
        "kdf_salt_b64": _b64(bytes(range(16))),
        "kdf_params": {"t": 3, "m": 65536, "p": 4},
        "wrapped_bundle_b64": _b64(b"\x01" * 120),
        "wrap_iv_b64": _b64(bytes(range(12))),
    }


def _payload(*envelopes: dict[str, object]) -> dict[str, object]:
    return {
        "key_id_b64": _b64(b"\x07" * 16),
        "envelope_version": 1,
        "envelopes": list(envelopes),
    }


@pytest.mark.asyncio
async def test_put_and_get_round_trip(client: AsyncClient, db: AsyncSession) -> None:
    await _login(client, db, "envelope@example.com")

    put = await client.put(
        "/api/v1/keys/envelopes",
        json=_payload(_envelope("password"), _envelope("recovery")),
    )
    assert put.status_code == 200

    got = await client.get("/api/v1/keys/envelopes")
    assert got.status_code == 200
    body = got.json()
    assert body["key_id_b64"] == _b64(b"\x07" * 16)
    assert {e["kind"] for e in body["envelopes"]} == {"password", "recovery"}


@pytest.mark.asyncio
async def test_replacement_is_wholesale(client: AsyncClient, db: AsyncSession) -> None:
    await _login(client, db, "wholesale@example.com")

    await client.put(
        "/api/v1/keys/envelopes",
        json=_payload(
            _envelope("password"),
            _envelope("recovery"),
            _envelope("passkey", credential_id=b"cred-1"),
        ),
    )
    await client.put(
        "/api/v1/keys/envelopes",
        json=_payload(_envelope("password"), _envelope("recovery")),
    )

    body = (await client.get("/api/v1/keys/envelopes")).json()
    assert {e["kind"] for e in body["envelopes"]} == {"password", "recovery"}


@pytest.mark.asyncio
async def test_set_without_recovery_wrap_is_rejected(
    client: AsyncClient, db: AsyncSession
) -> None:
    await _login(client, db, "norecovery@example.com")
    resp = await client.put("/api/v1/keys/envelopes", json=_payload(_envelope("password")))
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_passkey_wrap_must_name_its_credential(
    client: AsyncClient, db: AsyncSession
) -> None:
    await _login(client, db, "nocred@example.com")
    resp = await client.put(
        "/api/v1/keys/envelopes",
        json=_payload(_envelope("recovery"), _envelope("passkey")),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_recovery_wrap_cannot_be_deleted(client: AsyncClient, db: AsyncSession) -> None:
    await _login(client, db, "keeprecovery@example.com")
    await client.put(
        "/api/v1/keys/envelopes",
        json=_payload(_envelope("password"), _envelope("recovery")),
    )
    body = (await client.get("/api/v1/keys/envelopes")).json()
    recovery = next(e for e in body["envelopes"] if e["kind"] == "recovery")

    resp = await client.delete(f"/api/v1/keys/envelopes/{recovery['id']}")
    assert resp.status_code == 409
    assert resp.headers.get("code") == "ERR_LAST_FACTOR_PROTECTED"


@pytest.mark.asyncio
async def test_envelopes_are_scoped_to_the_calling_teacher(
    client: AsyncClient, db: AsyncSession
) -> None:
    await _login(client, db, "owner@example.com")
    await client.put(
        "/api/v1/keys/envelopes",
        json=_payload(_envelope("password"), _envelope("recovery")),
    )

    client.cookies.clear()
    await _login(client, db, "other@example.com")
    body = (await client.get("/api/v1/keys/envelopes")).json()
    assert body["envelopes"] == []


@pytest.mark.asyncio
async def test_envelopes_require_authentication(client: AsyncClient) -> None:
    client.cookies.clear()
    resp = await client.get("/api/v1/keys/envelopes")
    assert resp.status_code == 401
