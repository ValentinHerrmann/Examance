"""Authenticator enrollment, backup codes, and the factor-removal guard."""
from __future__ import annotations

import re

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import totp as totp_svc

from .factors import (
    DEFAULT_PASSWORD,
    complete_login,
    create_teacher,
    current_code,
    enrol_totp,
    sign_in,
)


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


@pytest.mark.asyncio
async def test_a_mistyped_code_can_be_retried(client: AsyncClient, db: AsyncSession) -> None:
    """
    One wrong digit costs an attempt, not the sign-in.

    The pending token is single-use, and it used to be spent before the code was
    checked — so a typo, or a phone whose clock had drifted, left every retry
    reporting an expired step as "invalid code" with no way forward but a reload.
    It is now consumed only by a factor that actually succeeds, and a failure
    hands back an equivalent token to try again with.
    """
    email = "retry-totp@example.com"
    teacher = await create_teacher(db, email)
    secret = await enrol_totp(db, teacher)

    first = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": DEFAULT_PASSWORD}
    )
    client.cookies.update(first.cookies)

    wrong = await client.post("/api/v1/auth/factor/totp", json={"code": "000000"})
    assert wrong.status_code == 401
    assert wrong.headers.get("code") == "ERR_MFA_INVALID_CODE"
    client.cookies.update(wrong.cookies)

    right = await client.post(
        "/api/v1/auth/factor/totp", json={"code": current_code(secret)}
    )
    assert right.status_code == 200, right.text
    assert right.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_a_spent_pending_token_says_the_step_expired(
    client: AsyncClient, db: AsyncSession
) -> None:
    """
    Reusing the token a *successful* factor consumed is a different failure.

    The frontend needs to tell the two apart: "try that code again" and "start
    the sign-in over" are opposite instructions.
    """
    email = "spent-pending@example.com"
    teacher = await create_teacher(db, email)
    secret = await enrol_totp(db, teacher)

    first = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": DEFAULT_PASSWORD}
    )
    pending = first.cookies["access_token"]

    client.cookies.set("access_token", pending)
    ok = await client.post(
        "/api/v1/auth/factor/totp", json={"code": current_code(secret)}
    )
    assert ok.status_code == 200

    client.cookies.set("access_token", pending)
    replay = await client.post(
        "/api/v1/auth/factor/totp", json={"code": current_code(secret)}
    )
    assert replay.status_code == 401
    assert replay.headers.get("code") == "ERR_STEP_EXPIRED"


@pytest.mark.asyncio
async def test_a_backup_code_issued_under_the_old_hash_still_works(
    client: AsyncClient, db: AsyncSession
) -> None:
    """
    Sets minted before the keyed digest cannot be converted — the plaintext is
    gone — so they are still verified the old way. Dropping that would have
    locked out every account holding codes issued before this change.
    """
    from app.models.mfa_credential import MfaBackupCode
    from app.services.crypto import hash_password

    email = "legacy-backup@example.com"
    teacher = await create_teacher(db, email)
    await enrol_totp(db, teacher)
    db.add(
        MfaBackupCode(teacher_id=teacher.id, code_hash=hash_password("ABCDEFGH23"))
    )
    await db.commit()

    first = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": DEFAULT_PASSWORD}
    )
    client.cookies.update(first.cookies)

    used = await client.post(
        "/api/v1/auth/factor/backup-code", json={"code": "abcde-fgh23"}
    )
    assert used.status_code == 200, used.text
    assert used.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_status_reports_recovery_and_factor_activity(
    client: AsyncClient, db: AsyncSession
) -> None:
    """
    What the security page renders per factor.

    The dates are nullable on purpose: they were added after the factors were,
    so an account that has been signing in for months can legitimately have
    none, and the page says "not recorded" rather than inventing one.
    """
    email = "status-detail@example.com"
    await sign_in(client, db, email)

    before = (await client.get("/api/v1/mfa/status")).json()
    assert before["has_recovery_code"] is False
    assert before["recovery_created_at"] is None
    # The sign-in that just happened wrote both.
    assert before["password_last_used_at"] is not None
    assert before["totp_last_used_at"] is not None
    assert before["totp_created_at"] is not None
    # Never changed, so never recorded.
    assert before["password_changed_at"] is None

    import base64

    def _b64(value: bytes) -> str:
        return base64.b64encode(value).decode()

    envelope = {
        "kind": "recovery",
        "credential_id_b64": None,
        "kdf": "argon2id",
        "kdf_salt_b64": _b64(bytes(range(16))),
        "kdf_params": {"t": 3, "m": 65536, "p": 4},
        "wrapped_bundle_b64": _b64(b"\x03" * 120),
        "wrap_iv_b64": _b64(bytes(range(12))),
    }
    put = await client.put(
        "/api/v1/keys/envelopes",
        json={"key_id_b64": _b64(b"\x04" * 16), "envelope_version": 1, "envelopes": [envelope]},
    )
    assert put.status_code == 200

    after = (await client.get("/api/v1/mfa/status")).json()
    assert after["has_recovery_code"] is True
    assert after["recovery_created_at"] is not None


@pytest.mark.asyncio
async def test_a_spent_code_says_so_instead_of_calling_itself_invalid(
    client: AsyncClient, db: AsyncSession
) -> None:
    """
    The code the authenticator is *still showing* is not a wrong code.

    Every sign-in straight after a password reset hits this: the reset took a
    code of its own moments earlier, and the app has not rolled over yet. Saying
    "invalid" sends the teacher hunting for a problem that fixes itself in
    thirty seconds.
    """
    email = "spent-code@example.com"
    teacher = await create_teacher(db, email)
    secret = await enrol_totp(db, teacher)
    await complete_login(client, email, secret)

    client.cookies.clear()
    first = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": DEFAULT_PASSWORD}
    )
    client.cookies.update(first.cookies)

    # The same window's code, already spent by the sign-in above.
    replay = await client.post(
        "/api/v1/auth/factor/totp", json={"code": current_code(secret)}
    )
    assert replay.status_code == 401
    assert replay.headers.get("code") == "ERR_MFA_CODE_ALREADY_USED"


@pytest.mark.asyncio
async def test_a_spent_code_costs_no_attempt(client: AsyncClient, db: AsyncSession) -> None:
    """
    It proves possession of the secret, so it is not a guess.

    Charging it to the failure counter is how retyping the displayed code a few
    times after a reset turned a thirty-second wait into a per-account lockout.
    """
    from app.services import login_throttle

    email = "spent-code-throttle@example.com"
    teacher = await create_teacher(db, email)
    secret = await enrol_totp(db, teacher)
    await complete_login(client, email, secret)

    for _ in range(6):
        client.cookies.clear()
        first = await client.post(
            "/api/v1/auth/login", json={"email": email, "password": DEFAULT_PASSWORD}
        )
        client.cookies.update(first.cookies)
        resp = await client.post(
            "/api/v1/auth/factor/totp", json={"code": current_code(secret)}
        )
        assert resp.headers.get("code") == "ERR_MFA_CODE_ALREADY_USED", resp.text

    # Past LOGIN_MAX_FAILED_ATTEMPTS, and still not locked.
    await login_throttle.assert_not_locked(email, teacher)


@pytest.mark.asyncio
async def test_a_genuinely_wrong_code_still_counts(
    client: AsyncClient, db: AsyncSession
) -> None:
    """The distinction must not weaken the throttle for actual guessing."""
    email = "wrong-code-counts@example.com"
    teacher = await create_teacher(db, email)
    await enrol_totp(db, teacher)

    first = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": DEFAULT_PASSWORD}
    )
    client.cookies.update(first.cookies)

    resp = await client.post("/api/v1/auth/factor/totp", json={"code": "000000"})
    assert resp.status_code == 401
    assert resp.headers.get("code") == "ERR_MFA_INVALID_CODE"
