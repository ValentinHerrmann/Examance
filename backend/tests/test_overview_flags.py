"""Favorites and archive (issue #252) and the share question after saving (issue #263)."""
from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Any

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from .factors import sign_in

API = "/api/v1/exercises"
EXAMS = "/api/v1/exams"


@pytest_asyncio.fixture
async def clients(client_factory) -> tuple[AsyncClient, AsyncClient]:
    return await client_factory(2)


@pytest_asyncio.fixture
async def owner(clients, db: AsyncSession) -> AsyncClient:
    a, _ = clients
    await sign_in(a, db, f"owner-{uuid.uuid4().hex[:8]}@example.com")
    return a


async def _library_row(client: AsyncClient, ex_id: str) -> dict[str, Any]:
    resp = await client.get(API)
    assert resp.status_code == 200, resp.text
    (row,) = [r for r in resp.json() if r["id"] == ex_id]
    return dict(row)


async def _new_exercise(client: AsyncClient) -> dict[str, Any]:
    resp = await client.post(API, json={"name": "Task", "latex_body": "\\BE Body"})
    assert resp.status_code == 201, resp.text
    return dict(resp.json())


@pytest.mark.asyncio
async def test_exam_flags_are_set_cleared_and_not_duplicated(owner) -> None:
    retention = (date.today() + timedelta(days=30)).isoformat()
    created = await owner.post(EXAMS, json={"title": "Exam", "retention_until": retention})
    assert created.status_code == 201, created.text
    exam_id = created.json()["id"]

    resp = await owner.patch(f"{EXAMS}/{exam_id}", json={"is_favorite": True, "archived": True})
    assert resp.status_code == 200, resp.text
    first_archived = resp.json()["archived_at"]
    assert resp.json()["is_favorite"] is True and first_archived is not None

    # Archiving again keeps the first date; an unrelated update keeps both flags.
    again = await owner.patch(f"{EXAMS}/{exam_id}", json={"archived": True, "title": "Renamed"})
    assert again.json()["archived_at"] == first_archived and again.json()["is_favorite"] is True

    dup = await owner.post(f"{EXAMS}/{exam_id}/duplicate", json={"retention_until": retention})
    assert dup.status_code == 201, dup.text
    assert dup.json()["is_favorite"] is False and dup.json()["archived_at"] is None

    cleared = await owner.patch(f"{EXAMS}/{exam_id}", json={"is_favorite": False, "archived": False})
    assert cleared.json()["is_favorite"] is False and cleared.json()["archived_at"] is None


@pytest.mark.asyncio
async def test_group_flags_reach_the_library_and_skip_duplicates(owner) -> None:
    ex = await _new_exercise(owner)
    group_id = ex["exercise_group_id"]
    resp = await owner.patch(
        f"{API}/groups/{group_id}", json={"is_favorite": True, "archived": True}
    )
    assert resp.status_code == 200, resp.text
    row = await _library_row(owner, ex["id"])
    assert row["group_favorite"] is True and row["group_archived_at"] is not None

    dup = await owner.post(f"{API}/{ex['id']}/duplicate")
    assert dup.status_code == 201, dup.text
    copy_row = await _library_row(owner, dup.json()["exercises"][0]["id"])
    assert copy_row["group_favorite"] is False and copy_row["group_archived_at"] is None


@pytest.mark.asyncio
async def test_share_question_is_asked_once_per_group(owner) -> None:
    ex = await _new_exercise(owner)
    assert (await _library_row(owner, ex["id"]))["group_share_asked"] is False

    resp = await owner.post(f"{API}/groups/{ex['exercise_group_id']}/share-asked")
    assert resp.status_code == 204, resp.text
    assert (await _library_row(owner, ex["id"]))["group_share_asked"] is True

    other = await _new_exercise(owner)
    shared = await owner.put(f"{API}/{other['id']}/sharing", json={"shared": True})
    assert shared.status_code == 200, shared.text
    assert (await _library_row(owner, other["id"]))["group_share_asked"] is True


@pytest.mark.asyncio
async def test_share_asked_is_scoped_to_the_owner(clients, owner, db: AsyncSession) -> None:
    _, b = clients
    await sign_in(b, db, f"other-{uuid.uuid4().hex[:8]}@example.com")
    ex = await _new_exercise(owner)
    resp = await b.post(f"{API}/groups/{ex['exercise_group_id']}/share-asked")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_share_default_round_trips_through_capabilities(owner) -> None:
    caps = await owner.get("/api/v1/user/capabilities")
    assert caps.json()["share_new_exercises"] is None
    for value in (True, False, None):
        resp = await owner.put(f"{API}/sharing/default", json={"share_new_exercises": value})
        assert resp.status_code == 204, resp.text
        caps = await owner.get("/api/v1/user/capabilities")
        assert caps.json()["share_new_exercises"] is value
