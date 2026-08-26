"""Authenticator enrollment, backup codes, and the factor-removal guard."""
from __future__ import annotations

import re

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import totp as totp_svc

from .factors import DEFAULT_PASSWORD, create_teacher, current_code, enrol_totp, sign_in


def _secret_from_uri(uri: str) -> bytes:
    import base64

    match = re.search(r"secret=([A-Z2-7]+)", uri)
    assert match, uri
    raw = match.group(1)
    return base64.b32decode(raw + "=" * (-len(raw) % 8))


@pytest.mark.asyncio
async def test_enrollment_completes_the_policy(client: AsyncClient, db: AsyncSession) -> None:
    """
    A password-only account enrols its second factor from the enrollment scope.

    This is the path every existing account takes on its first sign-in after the
    policy lands, so it has to work without a full session.
    """
    email = "enroll-flow@example.com"
    await create_teacher(db, email)

    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": DEFAULT_PASSWORD}
    )
    assert login.json()["status"] == "enroll_required"
    client.cookies.update(login.cookies)

    enroll = await client.post("/api/v1/mfa/totp/enroll")
    assert enroll.status_code == 200
    secret = _secret_from_uri(enroll.json()["otpauth_uri"])

    confirm = await client.post(
        "/api/v1/mfa/totp/confirm", json={"code": current_code(secret)}
    )
    assert confirm.status_code == 200
    assert len(confirm.json()["backup_codes"]) == 10

    status_resp = await client.get("/api/v1/mfa/status")
    body = status_resp.json()
    assert body["complete"] is True
    assert sorted(body["enrolled"]) == ["password", "totp"]


@pytest.mark.asyncio
async def test_an_unconfirmed_enrollment_does_not_count(
    client: AsyncClient, db: AsyncSession
) -> None:
    """Starting enrollment must not be enough to satisfy the policy."""
    email = "unconfirmed@example.com"
    await create_teacher(db, email)

    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": DEFAULT_PASSWORD}
    )
    client.cookies.update(login.cookies)
    await client.post("/api/v1/mfa/totp/enroll")

    again = await client.get("/api/v1/mfa/status")
    assert again.json()["complete"] is False


@pytest.mark.asyncio
async def test_a_wrong_code_does_not_confirm(client: AsyncClient, db: AsyncSession) -> None:
    email = "wrongcode@example.com"
    await create_teacher(db, email)
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": DEFAULT_PASSWORD}
    )
    client.cookies.update(login.cookies)
    await client.post("/api/v1/mfa/totp/enroll")

    resp = await client.post("/api/v1/mfa/totp/confirm", json={"code": "000000"})
    assert resp.status_code == 401
    assert resp.headers.get("code") == "ERR_MFA_INVALID_CODE"


@pytest.mark.asyncio
async def test_a_backup_code_stands_in_for_the_authenticator(
    client: AsyncClient, db: AsyncSession
) -> None:
    email = "backup@example.com"
    await create_teacher(db, email)
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": DEFAULT_PASSWORD}
    )
    client.cookies.update(login.cookies)
    enroll = await client.post("/api/v1/mfa/totp/enroll")
    secret = _secret_from_uri(enroll.json()["otpauth_uri"])
    codes = (
        await client.post("/api/v1/mfa/totp/confirm", json={"code": current_code(secret)})
    ).json()["backup_codes"]

    client.cookies.clear()
    first = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": DEFAULT_PASSWORD}
    )
    client.cookies.update(first.cookies)
    used = await client.post("/api/v1/auth/factor/backup-code", json={"code": codes[0]})
    assert used.status_code == 200
    assert used.json()["status"] == "ok"

    # Single use: the same code must not open a second sign-in.
    client.cookies.clear()
    again = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": DEFAULT_PASSWORD}
    )
    client.cookies.update(again.cookies)
    replay = await client.post("/api/v1/auth/factor/backup-code", json={"code": codes[0]})
    assert replay.status_code == 401


@pytest.mark.asyncio
async def test_removing_the_last_second_factor_is_refused(
    client: AsyncClient, db: AsyncSession
) -> None:
    """
    Without this guard a teacher could delete their way below the policy and
    lock themselves out of their own account.
    """
    await sign_in(client, db, "cannot-remove@example.com")

    resp = await client.delete("/api/v1/mfa/totp")
    assert resp.status_code == 409
    assert resp.headers.get("code") == "ERR_LAST_FACTOR_PROTECTED"


@pytest.mark.asyncio
async def test_a_totp_step_needs_a_pending_sign_in(client: AsyncClient) -> None:
    """The second factor is meaningless on its own — it identifies no account."""
    client.cookies.clear()
    resp = await client.post("/api/v1/auth/factor/totp", json={"code": "123456"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_totp_drift_window_is_one_step(client: AsyncClient, db: AsyncSession) -> None:
    email = "drift@example.com"
    teacher = await create_teacher(db, email)
    secret = await enrol_totp(db, teacher)

    first = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": DEFAULT_PASSWORD}
    )
    client.cookies.update(first.cookies)

    # Well outside the accepted window.
    far = totp_svc.generate_code(secret, totp_svc.current_step(0) + 10_000)
    resp = await client.post("/api/v1/auth/factor/totp", json={"code": far})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_an_admin_can_clear_a_locked_out_teachers_factors(
    client: AsyncClient, db: AsyncSession
) -> None:
    """
    The escape hatch for a teacher who lost a factor.

    It restores the *account*, not the data: an administrator who could undo the
    encryption could also read it.
    """
    teacher = await create_teacher(db, "stuck@example.com")
    await enrol_totp(db, teacher)

    await sign_in(client, db, "factor-admin@example.com", role="admin")
    resp = await client.post(f"/api/v1/admin/users/{teacher.id}/reset-factors")
    assert resp.status_code == 200

    client.cookies.clear()
    login = await client.post(
        "/api/v1/auth/login", json={"email": "stuck@example.com", "password": DEFAULT_PASSWORD}
    )
    assert login.json()["status"] == "enroll_required"


@pytest.mark.asyncio
async def test_only_admins_can_clear_factors(client: AsyncClient, db: AsyncSession) -> None:
    teacher = await create_teacher(db, "victim@example.com")
    await sign_in(client, db, "not-an-admin@example.com")
    resp = await client.post(f"/api/v1/admin/users/{teacher.id}/reset-factors")
    assert resp.status_code == 403
