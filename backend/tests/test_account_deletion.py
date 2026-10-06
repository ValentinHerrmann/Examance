"""Deleting accounts: by the holder (`DELETE /user/me`) and by an admin (`DELETE /admin/users`).

The database is shared across the whole session, so every address is unique per test and the
last-admin guard (which counts every admin in the database) is only exercised through its
callers' other refusals.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.teacher import Teacher

from .factors import create_teacher, sign_in

pytestmark = pytest.mark.asyncio

ADMIN_USERS = "/api/v1/admin/users"
ME = "/api/v1/user/me"
CAPABILITIES = "/api/v1/user/capabilities"


def _email(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}@school.example"


async def _gone(db: AsyncSession, teacher_id: uuid.UUID) -> bool:
    db.expire_all()
    return await db.get(Teacher, teacher_id) is None


async def test_admin_deletes_an_account(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, _email("admin"), role="admin")
    target = await create_teacher(db, _email("target"))

    resp = await client.delete(f"{ADMIN_USERS}/{target.id}")

    assert resp.status_code == 204
    assert await _gone(db, target.id)


async def test_admin_cannot_delete_own_account_there(client: AsyncClient, db: AsyncSession) -> None:
    admin = await sign_in(client, db, _email("admin"), role="admin")

    resp = await client.delete(f"{ADMIN_USERS}/{admin.id}")

    assert resp.status_code == 409
    assert resp.headers.get("code") == "ERR_DELETE_SELF"
    assert not await _gone(db, admin.id)


async def test_pending_account_is_not_deleted(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, _email("admin"), role="admin")
    pending = Teacher(email=_email("pending"), password_hash=None, role="teacher", approved_at=None)
    db.add(pending)
    await db.commit()

    resp = await client.delete(f"{ADMIN_USERS}/{pending.id}")

    assert resp.status_code == 409
    assert resp.headers.get("code") == "ERR_ACCOUNT_PENDING"


async def test_teacher_cannot_delete_other_accounts(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, _email("teacher"))
    other = await create_teacher(db, _email("other"))

    resp = await client.delete(f"{ADMIN_USERS}/{other.id}")

    assert resp.status_code == 403
    assert not await _gone(db, other.id)


async def test_teacher_deletes_own_account(client: AsyncClient, db: AsyncSession) -> None:
    teacher = await sign_in(client, db, _email("self"))

    resp = await client.delete(ME)

    assert resp.status_code == 200
    assert resp.json()["account_deleted"] is True
    assert await _gone(db, teacher.id)


async def test_capabilities_name_the_account(client: AsyncClient, db: AsyncSession) -> None:
    teacher = await sign_in(client, db, _email("caps"))

    resp = await client.get(CAPABILITIES)

    assert resp.status_code == 200
    assert resp.json()["account_id"] == str(teacher.id)
