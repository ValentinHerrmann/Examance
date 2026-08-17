"""Tests for initial admin bootstrap, user creation, and password reset flows."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.password_reset_token import PasswordResetToken
from app.models.teacher import Teacher
from app.services.bootstrap import create_initial_admin
from app.services.crypto import hash_password
from app.services.password_reset import (
    create_and_send_reset_token,
    hash_reset_token,
)


@pytest.mark.asyncio
async def test_initial_admin_bootstrap(db: AsyncSession) -> None:
    with patch.object(settings, "INITIAL_ADMIN_EMAIL", "bootstrapadmin@example.com"), \
         patch.object(settings, "INITIAL_ADMIN_PASSWORD", "SuperSecurePassword123!"):

        # Run bootstrap
        await create_initial_admin(db)

        # Verify admin created
        res = await db.execute(select(Teacher).where(Teacher.email == "bootstrapadmin@example.com"))
        admin = res.scalar_one_or_none()
        assert admin is not None
        assert admin.role == "admin"
        assert admin.password_hash is not None

        # Re-run bootstrap (should be idempotent with matching credentials)
        await create_initial_admin(db)
        res2 = await db.execute(select(Teacher).where(Teacher.email == "bootstrapadmin@example.com"))
        all_admins = res2.scalars().all()
        assert len(all_admins) == 1


@pytest.mark.asyncio
async def test_initial_admin_bootstrap_credential_mismatch_warning(
    db: AsyncSession, caplog: pytest.LogCaptureFixture
) -> None:
    existing_user = Teacher(
        email="mismatchadmin@example.com",
        password_hash=hash_password("OriginalPassword123!"),
        role="teacher",
    )
    db.add(existing_user)
    await db.commit()

    with patch.object(settings, "INITIAL_ADMIN_EMAIL", "mismatchadmin@example.com"), \
         patch.object(settings, "INITIAL_ADMIN_PASSWORD", "NewConfiguredPassword123!"), \
         caplog.at_level("WARNING"):

        await create_initial_admin(db)

        assert any(
            "already exists, but credentials or role do not match" in record.message
            for record in caplog.records
        )

    res = await db.execute(select(Teacher).where(Teacher.email == "mismatchadmin@example.com"))
    teacher = res.scalar_one()
    assert teacher.role == "teacher"


@pytest.mark.asyncio
async def test_admin_create_user_and_password_reset_flow(
    client: AsyncClient, db: AsyncSession
) -> None:
    # 1. Setup admin user and authenticate client
    admin = Teacher(
        email="admin-tester@example.com",
        password_hash=hash_password("AdminPass12345!"),
        role="admin",
    )
    db.add(admin)
    await db.commit()

    login_res = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin-tester@example.com", "password": "AdminPass12345!"},
    )
    assert login_res.status_code == 200
    client.cookies.update(login_res.cookies)

    # 2. Admin creates a new user (no password in body)
    with patch("app.services.email.send_email") as mock_send_email:
        mock_send_email.return_value = True

        create_res = await client.post(
            "/api/v1/admin/users",
            json={"email": "newteacher-reset-flow@example.com", "role": "teacher"},
        )
        assert create_res.status_code == 201
        body = create_res.json()
        assert body["email"] == "newteacher-reset-flow@example.com"
        assert body["password_reset_sent"] is True
        mock_send_email.assert_called_once()

    # 3. Verify teacher has no password set initially
    res = await db.execute(select(Teacher).where(Teacher.email == "newteacher-reset-flow@example.com"))
    new_teacher = res.scalar_one_or_none()
    assert new_teacher is not None
    assert new_teacher.password_hash is None

    # 4. Attempt login before setting password (should fail with ERR_PASSWORD_NOT_SET)
    client.cookies.clear()
    uninit_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "newteacher-reset-flow@example.com", "password": "AttemptedPassword123!"},
    )
    assert uninit_login.status_code == 401
    assert uninit_login.headers.get("code") == "ERR_PASSWORD_NOT_SET"

    # 5. Extract raw reset token from DB token_hash
    token_res = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.teacher_id == new_teacher.id)
    )
    reset_record = token_res.scalar_one()
    assert reset_record.used_at is None

    # 6. Complete password reset via POST /auth/reset-password
    # Generate a known token via service helper
    raw_token = await create_and_send_reset_token(db, new_teacher)

    reset_res = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": raw_token, "new_password": "NewSecurePassword123!"},
    )
    assert reset_res.status_code == 200

    # 7. Verify login succeeds with new password
    success_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "newteacher-reset-flow@example.com", "password": "NewSecurePassword123!"},
    )
    assert success_login.status_code == 200
    assert "access_token" in success_login.cookies


@pytest.mark.asyncio
async def test_forgot_password_generic_response(client: AsyncClient, db: AsyncSession) -> None:
    # 1. Existing user
    user = Teacher(
        email="existing@example.com",
        password_hash=hash_password("Password12345!"),
        role="teacher",
    )
    db.add(user)
    await db.commit()

    with patch("app.services.email.send_email") as mock_send_email:
        mock_send_email.return_value = True

        # Existing user request
        resp1 = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "existing@example.com"},
        )
        assert resp1.status_code == 200
        assert mock_send_email.call_count == 1

        # Non-existing user request (should return same 200 response to prevent enumeration)
        resp2 = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "nonexistent@example.com"},
        )
        assert resp2.status_code == 200
        assert resp1.json() == resp2.json()
        assert mock_send_email.call_count == 1  # Not called for non-existing


@pytest.mark.asyncio
async def test_invalid_or_expired_reset_token(client: AsyncClient, db: AsyncSession) -> None:
    teacher = Teacher(
        email="tokentest@example.com",
        password_hash=hash_password("OldPassword123!"),
        role="teacher",
    )
    db.add(teacher)
    await db.commit()

    # 1. Invalid token
    resp_invalid = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": "completely-invalid-token", "new_password": "NewPassword123!"},
    )
    assert resp_invalid.status_code == 400
    assert resp_invalid.headers.get("code") == "ERR_INVALID_TOKEN"

    # 2. Expired token
    raw_token = "expired-raw-token"
    token_record = PasswordResetToken(
        teacher_id=teacher.id,
        token_hash=hash_reset_token(raw_token),
        expires_at=datetime.now(UTC) - timedelta(hours=1),
    )
    db.add(token_record)
    await db.commit()

    resp_expired = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": raw_token, "new_password": "NewPassword123!"},
    )
    assert resp_expired.status_code == 400
    assert resp_expired.headers.get("code") == "ERR_INVALID_TOKEN"


@pytest.mark.asyncio
async def test_admin_forced_password_reset(client: AsyncClient, db: AsyncSession) -> None:
    # 1. Setup admin and existing teacher
    admin = Teacher(
        email="admin-resetter@example.com",
        password_hash=hash_password("AdminPass12345!"),
        role="admin",
    )
    teacher = Teacher(
        email="teacher-to-reset@example.com",
        password_hash=hash_password("OldWorkingPassword123!"),
        role="teacher",
    )
    db.add_all([admin, teacher])
    await db.commit()

    # Admin logs in
    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin-resetter@example.com", "password": "AdminPass12345!"},
    )
    client.cookies.update(admin_login.cookies)

    # 2. Admin triggers forced reset
    with patch("app.services.email.send_email") as mock_send_email:
        mock_send_email.return_value = True
        reset_req = await client.post(f"/api/v1/admin/users/{teacher.id}/reset-password")
        assert reset_req.status_code == 200
        assert reset_req.json()["password_reset_sent"] is True

    # 3. Verify existing password STILL works until reset completes
    client.cookies.clear()
    old_pw_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "teacher-to-reset@example.com", "password": "OldWorkingPassword123!"},
    )
    assert old_pw_login.status_code == 200
