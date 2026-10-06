"""Deleting accounts: by the holder through a mailed link, and by an admin.

The holder asks with `POST /user/me/deletion-request`; the mailed link's page previews
(`/auth/account-deletion/preview`, deletes nothing) and confirms (`/auth/account-deletion/confirm`,
single use). Either path may keep the library exercises on the server without an owner.

Mail is captured by patching ``app.services.email.send_email``; background tasks run inside the
request under httpx's ASGITransport. The database is shared across the whole session, so every
address is unique per test and the last-admin guard (which counts every admin in the database)
is only exercised through its callers' other refusals.
"""
from __future__ import annotations

import re
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, date, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account_deletion_request import AccountDeletionRequest
from app.models.exam import Exam
from app.models.exercise import Exercise
from app.models.teacher import Teacher

from .factors import create_teacher, sign_in

pytestmark = pytest.mark.asyncio

ADMIN_USERS = "/api/v1/admin/users"
REQUEST = "/api/v1/user/me/deletion-request"
PREVIEW = "/api/v1/auth/account-deletion/preview"
CONFIRM = "/api/v1/auth/account-deletion/confirm"
CAPABILITIES = "/api/v1/user/capabilities"


def _email(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}@school.example"


@contextmanager
def _outbox() -> Iterator[AsyncMock]:
    with patch("app.services.email.send_email", return_value=True) as sent:
        yield sent


def _token_from(sent: AsyncMock, address: str) -> str:
    mails: list[dict[str, Any]] = [
        call.kwargs for call in sent.call_args_list if call.kwargs["to_email"] == address
    ]
    assert mails, "no mail to the account holder"
    found = re.search(r"/delete-account\?token=([\w-]+)", mails[-1]["body_text"])
    assert found is not None, mails[-1]["body_text"]
    return found.group(1)


async def _gone(db: AsyncSession, teacher_id: uuid.UUID) -> bool:
    db.expire_all()
    return await db.get(Teacher, teacher_id) is None


async def _add_exercises(db: AsyncSession, teacher: Teacher) -> tuple[uuid.UUID, uuid.UUID]:
    """One library exercise and one exam-bound copy; returns their ids."""
    exam = Exam(
        teacher_id=teacher.id,
        title="Exam",
        latex_template="",
        retention_until=date.today() + timedelta(days=365),
    )
    db.add(exam)
    await db.flush()
    library = Exercise(teacher_id=teacher.id, name="Library", latex_body="x")
    bound = Exercise(teacher_id=teacher.id, exam_id=exam.id, name="Bound", latex_body="y")
    db.add_all([library, bound])
    await db.commit()
    return library.id, bound.id


async def _request(client: AsyncClient, email: str, *, keep: bool = False) -> str:
    with _outbox() as sent:
        resp = await client.post(REQUEST, json={"keep_exercises": keep})
    assert resp.status_code == 202, resp.text
    return _token_from(sent, email)


# --------------------------------------------------------------------------------------------
# Self-deletion through the mailed link
# --------------------------------------------------------------------------------------------


async def test_request_mails_a_link_and_deletes_nothing(
    client: AsyncClient, db: AsyncSession
) -> None:
    email = _email("self")
    teacher = await sign_in(client, db, email)

    token = await _request(client, email)
    preview = await client.post(PREVIEW, json={"token": token})

    assert preview.status_code == 200
    assert preview.json()["email"] == email
    assert preview.json()["keep_exercises"] is False
    assert not await _gone(db, teacher.id)


async def test_confirm_deletes_the_account_once(client: AsyncClient, db: AsyncSession) -> None:
    email = _email("self")
    teacher = await sign_in(client, db, email)
    token = await _request(client, email)

    first = await client.post(CONFIRM, json={"token": token})
    second = await client.post(CONFIRM, json={"token": token})

    assert first.status_code == 200
    assert first.json()["account_deleted"] is True
    assert await _gone(db, teacher.id)
    assert second.status_code == 400
    assert second.headers.get("code") == "ERR_INVALID_DELETION_TOKEN"


async def test_a_new_request_replaces_the_old_link(client: AsyncClient, db: AsyncSession) -> None:
    email = _email("self")
    await sign_in(client, db, email)
    old = await _request(client, email)
    new = await _request(client, email)

    assert (await client.post(PREVIEW, json={"token": old})).status_code == 400
    assert (await client.post(PREVIEW, json={"token": new})).status_code == 200


async def test_expired_link_is_refused(client: AsyncClient, db: AsyncSession) -> None:
    email = _email("self")
    teacher = await sign_in(client, db, email)
    token = await _request(client, email)
    row = await db.scalar(
        select(AccountDeletionRequest).where(AccountDeletionRequest.teacher_id == teacher.id)
    )
    assert row is not None
    row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    await db.commit()

    resp = await client.post(CONFIRM, json={"token": token})

    assert resp.status_code == 400
    assert not await _gone(db, teacher.id)


async def test_unknown_token_is_refused(client: AsyncClient) -> None:
    resp = await client.post(CONFIRM, json={"token": "not-a-token"})

    assert resp.status_code == 400
    assert resp.headers.get("code") == "ERR_INVALID_DELETION_TOKEN"


async def test_keep_exercises_leaves_library_exercises_without_owner(
    client: AsyncClient, db: AsyncSession
) -> None:
    email = _email("keep")
    teacher = await sign_in(client, db, email)
    library_id, bound_id = await _add_exercises(db, teacher)
    token = await _request(client, email, keep=True)

    resp = await client.post(CONFIRM, json={"token": token})

    assert resp.status_code == 200
    assert await _gone(db, teacher.id)
    kept = await db.get(Exercise, library_id)
    assert kept is not None
    assert kept.teacher_id is None
    # The exam-bound copy is not orphaned: it goes with its exam (the FK cascades on Postgres;
    # the SQLite test database does not enforce foreign keys).
    bound = await db.get(Exercise, bound_id)
    assert bound is None or bound.teacher_id == teacher.id


async def test_without_keep_no_exercise_is_orphaned(
    client: AsyncClient, db: AsyncSession
) -> None:
    email = _email("drop")
    teacher = await sign_in(client, db, email)
    library_id, _ = await _add_exercises(db, teacher)
    token = await _request(client, email)

    await client.post(CONFIRM, json={"token": token})

    db.expire_all()
    # Deleted with the account by the FK cascade on Postgres; never left behind without owner.
    library = await db.get(Exercise, library_id)
    assert library is None or library.teacher_id == teacher.id


# --------------------------------------------------------------------------------------------
# Admin deletion
# --------------------------------------------------------------------------------------------


async def test_admin_deletes_an_account(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, _email("admin"), role="admin")
    target = await create_teacher(db, _email("target"))

    resp = await client.delete(f"{ADMIN_USERS}/{target.id}")

    assert resp.status_code == 204
    assert await _gone(db, target.id)


async def test_admin_delete_can_keep_exercises(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, _email("admin"), role="admin")
    target = await create_teacher(db, _email("target"))
    library_id, _ = await _add_exercises(db, target)

    resp = await client.delete(f"{ADMIN_USERS}/{target.id}", params={"keep_exercises": "true"})

    assert resp.status_code == 204
    db.expire_all()
    kept = await db.get(Exercise, library_id)
    assert kept is not None
    assert kept.teacher_id is None


async def test_admin_cannot_delete_own_account_there(
    client: AsyncClient, db: AsyncSession
) -> None:
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


async def test_teacher_cannot_delete_other_accounts(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, _email("teacher"))
    other = await create_teacher(db, _email("other"))

    resp = await client.delete(f"{ADMIN_USERS}/{other.id}")

    assert resp.status_code == 403
    assert not await _gone(db, other.id)


async def test_capabilities_name_the_account(client: AsyncClient, db: AsyncSession) -> None:
    teacher = await sign_in(client, db, _email("caps"))

    resp = await client.get(CAPABILITIES)

    assert resp.status_code == 200
    assert resp.json()["account_id"] == str(teacher.id)
