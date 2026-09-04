"""
Shared helper for signing a test client in.

Login is a two-of-three factor flow — password, passkey, authenticator, any two —
so a password alone no longer produces a session. These helpers enrol an
authenticator directly in the database and then drive the real endpoints, so the
suite exercises the same path a browser takes rather than a shortcut around it.
"""
from __future__ import annotations

import time
from datetime import UTC, datetime

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mfa_credential import MfaCredential
from app.models.teacher import Teacher
from app.services import totp as totp_svc
from app.services.crypto import hash_password
from app.services.mfa_secret import encrypt_secret

DEFAULT_PASSWORD = "Password123!-ok"  # noqa: S105 - test fixture credential


async def enrol_totp(db: AsyncSession, teacher: Teacher) -> bytes:
    """Give *teacher* a confirmed authenticator and return its secret."""
    secret = totp_svc.generate_secret()
    secret_ct, secret_iv = encrypt_secret(secret)
    db.add(
        MfaCredential(
            teacher_id=teacher.id,
            secret_ct=secret_ct,
            secret_iv=secret_iv,
            confirmed_at=datetime.now(tz=UTC),
        )
    )
    await db.commit()
    return secret


def current_code(secret: bytes, *, offset_steps: int = 0) -> str:
    return totp_svc.generate_code(secret, totp_svc.current_step(int(time.time())) + offset_steps)


async def create_teacher(
    db: AsyncSession,
    email: str,
    *,
    role: str = "teacher",
    password: str = DEFAULT_PASSWORD,
) -> Teacher:
    teacher = Teacher(email=email, password_hash=hash_password(password), role=role)
    db.add(teacher)
    await db.commit()
    return teacher


async def complete_login(
    client: AsyncClient,
    email: str,
    secret: bytes,
    *,
    password: str = DEFAULT_PASSWORD,
) -> None:
    """Drive password then authenticator, leaving the client holding a session."""
    first = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "factor_required"
    client.cookies.update(first.cookies)

    second = await client.post(
        "/api/v1/auth/factor/totp", json={"code": current_code(secret)}
    )
    assert second.status_code == 200, second.text
    assert second.json()["status"] == "ok"
    client.cookies.update(second.cookies)


async def sign_in(
    client: AsyncClient,
    db: AsyncSession,
    email: str,
    *,
    role: str = "teacher",
    password: str = DEFAULT_PASSWORD,
) -> Teacher:
    """Create a teacher with two factors and sign the client in as them."""
    teacher = await create_teacher(db, email, role=role, password=password)
    secret = await enrol_totp(db, teacher)
    await complete_login(client, email, secret, password=password)
    return teacher


async def start_reset(client: AsyncClient, token: str) -> dict[str, object]:
    """
    Open a password reset with the emailed token.

    The token stands in for the password factor but is not, on its own, enough:
    mailbox access completing a reset is the bypass the second factor closes.
    """
    resp = await client.post("/api/v1/auth/reset/start", json={"token": token})
    assert resp.status_code == 200, resp.text
    client.cookies.update(resp.cookies)
    return dict(resp.json())


async def complete_reset(
    client: AsyncClient,
    token: str,
    new_password: str,
    secret: bytes | None = None,
) -> None:
    """Drive a whole reset: token, second factor where one exists, new password."""
    step = await start_reset(client, token)
    if step["status"] == "factor_required":
        assert secret is not None, "account has a second factor; pass its secret"
        second = await client.post(
            "/api/v1/auth/factor/totp", json={"code": current_code(secret)}
        )
        assert second.status_code == 200, second.text
        client.cookies.update(second.cookies)

    done = await client.post(
        "/api/v1/auth/reset-password", json={"token": token, "new_password": new_password}
    )
    assert done.status_code == 200, done.text
