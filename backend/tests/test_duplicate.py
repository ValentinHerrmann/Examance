"""Duplicating own exercises and exams (issue #121).

A duplicate copies content only: no copy provenance (it is not a resync copy), no results, and
another account's rows are never reachable."""
from __future__ import annotations

import base64
import uuid
from datetime import date, timedelta
from typing import Any

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exercise_resource import ExerciseResource

from .factors import sign_in

API = "/api/v1/exercises"
EXAMS = "/api/v1/exams"
RETENTION = (date.today() + timedelta(days=30)).isoformat()


@pytest_asyncio.fixture
async def setup(client_factory, db: AsyncSession) -> dict[str, Any]:
    a, b = await client_factory(2)
    suffix = uuid.uuid4().hex[:8]
    await sign_in(a, db, f"dup-owner-{suffix}@example.com")
    await sign_in(b, db, f"dup-other-{suffix}@example.com")
    created = await a.post(API, json={"name": "Brüche", "latex_body": "\\BE Teil A"})
    assert created.status_code == 201, created.text
    ex = created.json()
    variant = await a.post(
        f"{API}/{ex['id']}/new-variant", json={"latex_body": "\\BE Teil B", "variant_key": "B"}
    )
    assert variant.status_code == 201, variant.text
    resp = await a.post(
        f"{API}/{ex['id']}/resources",
        json={"filename": "fig.png", "mime_type": "image/png",
              "content_b64": base64.b64encode(b"img").decode("ascii")},
    )
    assert resp.status_code == 201, resp.text
    return {"a": a, "b": b, "ex": ex}


async def _exam(client: AsyncClient, exercise_id: str) -> dict[str, Any]:
    group_id = str(uuid.uuid4())
    resp = await client.post(
        EXAMS,
        json={
            "title": "Klassenarbeit",
            "retention_until": RETENTION,
            "klasse": "7b",
            "page_breaks": [group_id],
            "mc_groups": [{"id": group_id, "title": "MC", "order_index": 1}],
            "exercise_links": [
                {"exercise_id": exercise_id, "order_index": 1, "mc_group_id": group_id,
                 "sub_index": 0},
            ],
        },
    )
    assert resp.status_code == 201, resp.text
    return dict(resp.json())


@pytest.mark.asyncio
async def test_duplicate_exercise_copies_variants_and_files(setup, db: AsyncSession) -> None:
    a, ex = setup["a"], setup["ex"]
    resp = await a.post(f"{API}/{ex['id']}/duplicate")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["group_id"] != ex["exercise_group_id"]
    rows = body["exercises"]
    assert sorted(r["latex_body"] for r in rows) == ["\\BE Teil A", "\\BE Teil B"]
    for row in rows:
        assert row["name"] == "Brüche (Kopie)"
        assert row["version"] == 1
        assert row["copied_from_exercise_id"] is None
    files = (
        await db.execute(
            select(ExerciseResource).where(
                ExerciseResource.exercise_id.in_([uuid.UUID(r["id"]) for r in rows])
            )
        )
    ).scalars().all()
    assert len(files) == 1


@pytest.mark.asyncio
async def test_duplicate_foreign_exercise_is_404(setup) -> None:
    resp = await setup["b"].post(f"{API}/{setup['ex']['id']}/duplicate")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_duplicate_exam_relinks_without_results(setup) -> None:
    a, ex = setup["a"], setup["ex"]
    source = await _exam(a, ex["id"])
    resp = await a.post(f"{EXAMS}/{source['id']}/duplicate", json={"retention_until": RETENTION})
    assert resp.status_code == 201, resp.text
    dup = resp.json()
    assert dup["id"] != source["id"]
    assert dup["title"] == "Klassenarbeit (Kopie)"
    assert dup["klasse"] == "7b"
    assert dup["compilation_status"] == "pending"
    assert [e["id"] for e in dup["exercises"]] == [ex["id"]]
    (group,) = dup["mc_groups"]
    assert group["id"] != source["mc_groups"][0]["id"]
    assert group["member_ids"] == [ex["id"]]
    assert dup["page_breaks"] == [group["id"]]
    subs = await a.get(f"{EXAMS}/{dup['id']}/submissions")
    assert subs.status_code == 200 and subs.json() == []


@pytest.mark.asyncio
async def test_duplicate_foreign_exam_is_404(setup) -> None:
    source = await _exam(setup["a"], setup["ex"]["id"])
    resp = await setup["b"].post(
        f"{EXAMS}/{source['id']}/duplicate", json={"retention_until": RETENTION}
    )
    assert resp.status_code == 404
