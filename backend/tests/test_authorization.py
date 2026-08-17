"""Cross-tenant object-level authorization tests.

Guards the ownership predicates on the exercise library and on exam→exercise
linking. Before these checks existed, any authenticated teacher could read,
rewrite or delete another teacher's exercises by primary key, and could link a
foreign exercise into their own exam to read its body back out.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from datetime import date, datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.database import get_db
from app.main import app
from app.models.teacher import Teacher
from app.services.crypto import hash_password

PASSWORD = "correct-horse-battery-staple"


@pytest_asyncio.fixture
async def clients(engine) -> AsyncGenerator[tuple[AsyncClient, AsyncClient], None]:
    """Two independent clients so each teacher keeps its own cookie jar."""
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="https://test") as a:
        async with AsyncClient(transport=transport, base_url="https://test") as b:
            yield a, b
    app.dependency_overrides.clear()


async def _register(client: AsyncClient, db: AsyncSession, email: str) -> None:
    teacher = Teacher(
        email=email,
        password_hash=hash_password(PASSWORD),
        role="teacher",
    )
    db.add(teacher)
    await db.commit()
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
    )
    assert resp.status_code == 200, resp.text
    client.cookies.update(resp.cookies)


async def _create_exercise(client: AsyncClient, name: str) -> str:
    resp = await client.post(
        "/api/v1/exercises",
        json={"name": name, "latex_body": "\\BE Secret question body"},
    )
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


@pytest_asyncio.fixture
async def two_teachers(clients, db: AsyncSession) -> tuple[AsyncClient, AsyncClient, str]:
    """Teacher A owns one exercise; teacher B is a separate account.

    The `engine` fixture is session-scoped, so rows persist across tests in this
    module — emails must be unique per test to avoid registration collisions.
    """
    a, b = clients
    suffix = uuid.uuid4().hex[:8]
    await _register(a, db, f"owner-{suffix}@example.com")
    await _register(b, db, f"attacker-{suffix}@example.com")
    exercise_id = await _create_exercise(a, "Owner's exercise")
    return a, b, exercise_id


@pytest.mark.asyncio
async def test_owner_can_read_own_exercise(two_teachers) -> None:
    a, _b, exercise_id = two_teachers
    resp = await a.get(f"/api/v1/exercises/{exercise_id}")
    assert resp.status_code == 200
    assert "Secret question body" in resp.json()["latex_body"]


@pytest.mark.asyncio
async def test_foreign_teacher_cannot_read_exercise(two_teachers) -> None:
    _a, b, exercise_id = two_teachers
    resp = await b.get(f"/api/v1/exercises/{exercise_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_foreign_teacher_cannot_update_exercise(two_teachers) -> None:
    a, b, exercise_id = two_teachers
    resp = await b.patch(
        f"/api/v1/exercises/{exercise_id}", json={"latex_body": "tampered"}
    )
    assert resp.status_code == 404
    # Owner's copy is untouched.
    owner_view = await a.get(f"/api/v1/exercises/{exercise_id}")
    assert "Secret question body" in owner_view.json()["latex_body"]


@pytest.mark.asyncio
async def test_foreign_teacher_cannot_delete_exercise(two_teachers) -> None:
    """DELETE stays idempotent (204) but must not remove someone else's row."""
    a, b, exercise_id = two_teachers
    resp = await b.delete(f"/api/v1/exercises/{exercise_id}")
    assert resp.status_code == 204
    assert (await a.get(f"/api/v1/exercises/{exercise_id}")).status_code == 200


@pytest.mark.asyncio
async def test_owner_can_delete_own_exercise(two_teachers) -> None:
    a, _b, exercise_id = two_teachers
    assert (await a.delete(f"/api/v1/exercises/{exercise_id}")).status_code == 204
    assert (await a.get(f"/api/v1/exercises/{exercise_id}")).status_code == 404


@pytest.mark.asyncio
async def test_foreign_teacher_cannot_version_or_variant_exercise(two_teachers) -> None:
    a, b, exercise_id = two_teachers
    assert (
        await b.post(f"/api/v1/exercises/{exercise_id}/new-version", json={})
    ).status_code == 404
    assert (
        await b.post(f"/api/v1/exercises/{exercise_id}/new-variant", json={})
    ).status_code == 404
    # The owner's version must still be the current one.
    owner_view = await a.get(f"/api/v1/exercises/{exercise_id}")
    assert owner_view.json()["is_current"] is True


@pytest.mark.asyncio
async def test_foreign_exercise_cannot_be_linked_into_own_exam(two_teachers) -> None:
    """The read-amplification path: link a foreign exercise, then read it back."""
    _a, b, exercise_id = two_teachers
    resp = await b.post(
        "/api/v1/exams",
        json={
            "title": "Attacker exam",
            "retention_until": (date.today() + timedelta(days=30)).isoformat(),
            "exercise_ids": [exercise_id],
        },
    )
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_foreign_exercise_cannot_be_linked_via_patch(two_teachers) -> None:
    _a, b, exercise_id = two_teachers
    created = await b.post(
        "/api/v1/exams",
        json={
            "title": "Attacker exam",
            "retention_until": (date.today() + timedelta(days=30)).isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    exam_id = created.json()["id"]

    resp = await b.patch(
        f"/api/v1/exams/{exam_id}",
        json={"exercise_links": [{"exercise_id": exercise_id, "order_index": 1}]},
    )
    assert resp.status_code == 404, resp.text

    # And nothing leaked into the exam representation.
    view = await b.get(f"/api/v1/exams/{exam_id}")
    assert view.json()["exercises"] == []


@pytest.mark.asyncio
async def test_owner_can_still_link_own_exercise(two_teachers) -> None:
    """Regression guard: the ownership check must not break the normal path."""
    a, _b, exercise_id = two_teachers
    resp = await a.post(
        "/api/v1/exams",
        json={
            "title": "Owner exam",
            "retention_until": (date.today() + timedelta(days=30)).isoformat(),
            "exercise_ids": [exercise_id],
        },
    )
    assert resp.status_code == 201, resp.text
    assert [e["id"] for e in resp.json()["exercises"]] == [exercise_id]
