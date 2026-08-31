"""Changing a password from an open session.

The route that did not exist before: a signed-in teacher had to sign out and go
through the emailed reset, which invalidates their key wrap and then asks for
the recovery code to undo the damage. This writes the new password and the
re-wrapped key together, and leaves the session it was made from alive.
"""
from __future__ import annotations

import base64

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.key_envelope import KeyEnvelope
from app.models.refresh_token import RefreshToken
from app.models.teacher import Teacher

from .factors import (
    DEFAULT_PASSWORD,
    complete_login,
    create_teacher,
    current_code,
    enrol_totp,
    sign_in,
)

_NEW_PASSWORD = "a-brand-new-one-99"  # noqa: S105 - test fixture credential


def _b64(value: bytes) -> str:
    return base64.b64encode(value).decode()


def _envelope(kind: str) -> dict[str, object]:
    return {
        "kind": kind,
        "credential_id_b64": None,
        "kdf": "argon2id",
        "kdf_salt_b64": _b64(bytes(range(16))),
        "kdf_params": {"t": 3, "m": 65536, "p": 4},
        "wrapped_bundle_b64": _b64(b"\x02" * 120),
        "wrap_iv_b64": _b64(bytes(range(12))),
    }


async def _sign_in_at_next_step(client: AsyncClient, email: str, secret: bytes) -> None:
    """Sign in with the *next* authenticator code, so a second device can too."""
    first = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": DEFAULT_PASSWORD}
    )
    client.cookies.update(first.cookies)
    second = await client.post(
        "/api/v1/auth/factor/totp", json={"code": current_code(secret, offset_steps=1)}
    )
    assert second.status_code == 200, second.text
    client.cookies.update(second.cookies)


def _envelope_set() -> dict[str, object]:
    return {
        "key_id_b64": _b64(b"\x09" * 16),
        "envelope_version": 1,
        "envelopes": [_envelope("password"), _envelope("recovery")],
    }


@pytest.mark.asyncio
async def test_the_new_password_signs_in_and_the_key_copy_moves_with_it(
    client: AsyncClient, db: AsyncSession
) -> None:
    email = "change-me@example.com"
    teacher = await sign_in(client, db, email)

    resp = await client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": DEFAULT_PASSWORD,
            "new_password": _NEW_PASSWORD,
            "envelope": _envelope_set(),
        },
    )
    assert resp.status_code == 200, resp.text

    # The wrap written by the request is the usable one — the point of sending
    # both together is that the password and its key copy cannot disagree.
    wraps = await db.execute(
        select(KeyEnvelope).where(
            KeyEnvelope.teacher_id == teacher.id, KeyEnvelope.kind == "password"
        )
    )
    password_wraps = wraps.scalars().all()
    assert len(password_wraps) == 1
    assert password_wraps[0].invalidated_at is None

    await db.refresh(teacher)
    assert teacher.password_changed_at is not None

    client.cookies.clear()
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": _NEW_PASSWORD}
    )
    assert login.status_code == 200
    assert login.json()["status"] == "factor_required"


@pytest.mark.asyncio
async def test_the_old_password_stops_working(client: AsyncClient, db: AsyncSession) -> None:
    email = "old-password@example.com"
    await sign_in(client, db, email)

    await client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": DEFAULT_PASSWORD,
            "new_password": _NEW_PASSWORD,
            "envelope": _envelope_set(),
        },
    )

    client.cookies.clear()
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": DEFAULT_PASSWORD}
    )
    assert login.status_code == 401


@pytest.mark.asyncio
async def test_a_wrong_current_password_is_refused(
    client: AsyncClient, db: AsyncSession
) -> None:
    """
    And costs a throttle attempt.

    Without that this endpoint would be a password oracle that skips the login
    cooloff entirely — slower per guess, but unbounded.
    """
    email = "wrong-current@example.com"
    teacher = await sign_in(client, db, email)

    resp = await client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": "not-the-password",
            "new_password": _NEW_PASSWORD,
            "envelope": _envelope_set(),
        },
    )
    assert resp.status_code == 401
    assert resp.headers.get("code") == "ERR_INVALID_CREDENTIALS"

    await db.refresh(teacher)
    assert teacher.password_changed_at is None


@pytest.mark.asyncio
async def test_without_a_re_wrap_the_password_wrap_is_marked_stale(
    client: AsyncClient, db: AsyncSession
) -> None:
    """
    The server cannot re-wrap a key it has never seen.

    Marking the wrap unusable is what sends the teacher to their recovery code
    instead of to a vault that silently reads as empty.
    """
    email = "no-envelope@example.com"
    teacher = await sign_in(client, db, email)

    await client.put("/api/v1/keys/envelopes", json=_envelope_set())

    resp = await client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": DEFAULT_PASSWORD,
            "new_password": _NEW_PASSWORD,
            "envelope": None,
        },
    )
    assert resp.status_code == 200, resp.text

    wrap = await db.execute(
        select(KeyEnvelope).where(
            KeyEnvelope.teacher_id == teacher.id, KeyEnvelope.kind == "password"
        )
    )
    assert wrap.scalars().first().invalidated_at is not None  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_this_session_survives_while_the_others_are_revoked(
    client: AsyncClient, db: AsyncSession
) -> None:
    """
    A teacher changing their own password has not asked to be logged out of the
    browser they are doing it in — but every other device has to re-authenticate.
    """
    email = "sessions@example.com"
    teacher = await create_teacher(db, email)
    secret = await enrol_totp(db, teacher)

    # A second device, signed in first and left alone. The two sign-ins have to
    # use different time steps: a code is refused on its second use, which is
    # the replay guard doing its job.
    other = AsyncClient(transport=client._transport, base_url=str(client.base_url))
    await complete_login(other, email, secret)
    await _sign_in_at_next_step(client, email, secret)
    resp = await client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": DEFAULT_PASSWORD,
            "new_password": _NEW_PASSWORD,
            "envelope": _envelope_set(),
        },
    )
    assert resp.status_code == 200, resp.text

    live = await db.execute(
        select(RefreshToken).where(
            RefreshToken.teacher_id == teacher.id, RefreshToken.revoked.is_(False)
        )
    )
    assert len(live.scalars().all()) == 1

    assert (await client.post("/api/v1/auth/refresh")).status_code == 200
    assert (await other.post("/api/v1/auth/refresh")).status_code == 401
    await other.aclose()


@pytest.mark.asyncio
async def test_a_pending_session_cannot_change_a_password(
    client: AsyncClient, db: AsyncSession
) -> None:
    """One factor is not a session, and must not be enough to set a password."""
    email = "half-signed-in@example.com"
    teacher = await create_teacher(db, email)
    await enrol_totp(db, teacher)

    first = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": DEFAULT_PASSWORD}
    )
    client.cookies.update(first.cookies)

    resp = await client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": DEFAULT_PASSWORD,
            "new_password": _NEW_PASSWORD,
            "envelope": _envelope_set(),
        },
    )
    # 403 rather than 401: the token is valid, its scope is not.
    assert resp.status_code == 403

    stored = await db.execute(select(Teacher).where(Teacher.id == teacher.id))
    assert stored.scalar_one().password_changed_at is None
