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


@pytest.mark.asyncio
async def test_a_refresh_cookie_cannot_skip_the_second_factor(
    client: AsyncClient, db: AsyncSession
) -> None:
    """
    A refresh token minted for a half-finished sign-in must not become a session.

    Refresh used to hand out a `full` access token unconditionally, so any
    surviving refresh cookie — one left over from before the policy, or one a
    browser did not drop when the sign-in demoted it — was a complete way around
    the two-of-three rule.
    """
    from datetime import UTC, datetime

    from app.models.refresh_token import RefreshToken
    from app.services.jwt import create_refresh_token, decode_token

    teacher = await _create_test_teacher(db, "stale-refresh@example.com")
    await enrol_totp(db, teacher)

    token, jti = create_refresh_token(
        teacher.id, teacher.email, teacher.role, amr=["password"]
    )
    db.add(
        RefreshToken(
            jti=jti,
            teacher_id=teacher.id,
            expires_at=datetime.fromtimestamp(decode_token(token)["exp"], tz=UTC),
        )
    )
    await db.commit()

    client.cookies.set("refresh_token", token)
    resp = await client.post("/api/v1/auth/refresh")

    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "factor_required"
    assert "refresh_token" not in resp.cookies


@pytest.mark.asyncio
async def test_a_refresh_token_without_amr_fails_closed(
    client: AsyncClient, db: AsyncSession
) -> None:
    """A token minted before `amr` existed carries no proven factors at all."""
    from datetime import UTC, datetime

    from app.models.refresh_token import RefreshToken
    from app.services.jwt import create_refresh_token, decode_token

    teacher = await _create_test_teacher(db, "amr-less@example.com")
    await enrol_totp(db, teacher)

    token, jti = create_refresh_token(teacher.id, teacher.email, teacher.role)
    db.add(
        RefreshToken(
            jti=jti,
            teacher_id=teacher.id,
            expires_at=datetime.fromtimestamp(decode_token(token)["exp"], tz=UTC),
        )
    )
    await db.commit()

    client.cookies.set("refresh_token", token)
    resp = await client.post("/api/v1/auth/refresh")
    assert resp.json()["status"] == "factor_required"


async def _enrol_passkey(db: AsyncSession, teacher: Teacher) -> None:
    """Give *teacher* a real passkey row, so the account genuinely has two factors."""
    import secrets

    from app.models.webauthn_credential import WebAuthnCredential

    db.add(
        WebAuthnCredential(
            credential_id=secrets.token_bytes(16),
            teacher_id=teacher.id,
            public_key=secrets.token_bytes(32),
            sign_count=0,
            prf_salt=secrets.token_bytes(32),
            supports_prf=True,
        )
    )
    await db.commit()


async def _pending_cookie(
    client: AsyncClient, teacher: Teacher, amr: list[str], *, scope: str = "auth_pending"
) -> None:
    """
    Put the client mid-sign-in with *amr* already proven.

    A passkey ceremony needs a real authenticator, so the token a passkey step
    would have issued is minted directly. Everything downstream — the scope, the
    single-use jti, the factor list — is the same object the endpoint produces.
    """
    from app.services import pending_token
    from app.services.jwt import create_access_token, decode_token

    token = create_access_token(
        teacher.id, teacher.email, teacher.role, scope=scope, amr=amr
    )
    await pending_token.register(decode_token(token).get("jti"))
    client.cookies.set("access_token", token)


@pytest.mark.asyncio
async def test_the_password_completes_a_passkey_sign_in(
    client: AsyncClient, db: AsyncSession
) -> None:
    """
    Passkey then password — one of the three pairs the policy promises.

    `/auth/login` hard-codes an empty presented-factor list, so it can only ever
    open a sign-in. Without a factor endpoint of its own the password could
    never come second, and a passkey-first sign-in had nothing to offer but the
    authenticator: a policy that says "any two" and a screen that meant one.
    """
    teacher = await _create_test_teacher(db, "passkey-then-password@example.com")
    await _enrol_passkey(db, teacher)
    await _pending_cookie(client, teacher, ["passkey"])

    resp = await client.post(
        "/api/v1/auth/factor/password", json={"password": "s3cr3t!!-min12"}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "ok"
    assert sorted(body["satisfied"]) == ["passkey", "password"]
    assert "refresh_token" in resp.cookies


@pytest.mark.asyncio
async def test_the_password_cannot_be_presented_twice(
    client: AsyncClient, db: AsyncSession
) -> None:
    """One factor presented twice is one factor, not two."""
    teacher = await _create_test_teacher(db, "password-twice@example.com")
    await _pending_cookie(client, teacher, ["password"])

    resp = await client.post(
        "/api/v1/auth/factor/password", json={"password": "s3cr3t!!-min12"}
    )
    assert resp.status_code == 400
    assert resp.headers.get("code") == "ERR_FACTOR_ALREADY_PRESENTED"


@pytest.mark.asyncio
async def test_the_password_factor_is_not_reachable_in_a_reset(
    client: AsyncClient, db: AsyncSession
) -> None:
    """
    A reset exists because the password is unavailable.

    Accepting it there would also mean the emailed token plus the old password
    were enough to set a new one.
    """
    teacher = await _create_test_teacher(db, "reset-password-factor@example.com")
    await _pending_cookie(client, teacher, ["password"], scope="reset_pending")

    resp = await client.post(
        "/api/v1/auth/factor/password", json={"password": "s3cr3t!!-min12"}
    )
    assert resp.status_code == 403
    assert resp.headers.get("code") == "ERR_FACTOR_REQUIRED"


@pytest.mark.asyncio
async def test_a_wrong_password_at_the_second_step_can_be_retried(
    client: AsyncClient, db: AsyncSession
) -> None:
    """A typo costs an attempt, not the sign-in — as for a mistyped code."""
    teacher = await _create_test_teacher(db, "password-second-retry@example.com")
    await _enrol_passkey(db, teacher)
    await _pending_cookie(client, teacher, ["passkey"])

    wrong = await client.post(
        "/api/v1/auth/factor/password", json={"password": "not-the-password"}
    )
    assert wrong.status_code == 401
    assert wrong.headers.get("code") == "ERR_INVALID_CREDENTIALS"
    client.cookies.update(wrong.cookies)

    right = await client.post(
        "/api/v1/auth/factor/password", json={"password": "s3cr3t!!-min12"}
    )
    assert right.status_code == 200, right.text
    assert right.json()["status"] == "ok"
