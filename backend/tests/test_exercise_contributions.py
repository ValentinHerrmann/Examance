"""Proposals from a linked copy back to the shared original (issue #65).

The owner's library changes only on an explicit accept, and only by a new version or a new
variant: an exam built on the previous row keeps it."""
from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.database import get_db
from app.main import app
from app.models.exercise_contribution import ExerciseContribution
from app.services import retention

from .factors import mails_to, outbox, sign_in

API = "/api/v1/exercises"
CONTRIB = f"{API}/contributions"


@pytest_asyncio.fixture
async def clients(engine) -> AsyncGenerator[tuple[AsyncClient, AsyncClient, AsyncClient], None]:
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
            async with AsyncClient(transport=transport, base_url="https://test") as c:
                yield a, b, c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def linked(clients, db: AsyncSession) -> dict[str, Any]:
    """A shares an exercise; B copied it (linked). C is an unrelated account."""
    a, b, c = clients
    suffix = uuid.uuid4().hex[:8]
    owner = await sign_in(a, db, f"author-{suffix}@example.com")
    contributor = await sign_in(b, db, f"contributor-{suffix}@example.com")
    await sign_in(c, db, f"bystander-{suffix}@example.com")
    created = await a.post(API, json={"name": "Task", "latex_body": "\\BE Original"})
    ex_id = created.json()["id"]
    assert (await a.put(f"{API}/{ex_id}/sharing", json={"shared": True})).status_code == 200
    copied = (await b.post(f"{API}/{ex_id}/copy")).json()
    (copy_row,) = copied["exercises"]
    return {
        "a": a, "b": b, "c": c, "owner": owner, "contributor": contributor,
        "ex_id": ex_id, "group_id": copied["group_id"], "copy_id": copy_row["id"],
    }


async def _propose(b: AsyncClient, group_id: str, ids: list[str], message: str = "") -> list[str]:
    resp = await b.post(
        f"{API}/groups/{group_id}/contributions", json={"exercise_ids": ids, "message": message}
    )
    assert resp.status_code == 201, resp.text
    return list(resp.json())


async def _edit_copy(b: AsyncClient, copy_id: str, body: str) -> None:
    resp = await b.patch(f"{API}/{copy_id}", json={"latex_body": body})
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_version_proposal_becomes_a_new_version(linked) -> None:
    a, b = linked["a"], linked["b"]
    exam = await a.post(
        "/api/v1/exams",
        json={
            "title": "Exam",
            "retention_until": (date.today() + timedelta(days=30)).isoformat(),
            "exercise_ids": [linked["ex_id"]],
        },
    )
    assert exam.status_code == 201, exam.text
    await _edit_copy(b, linked["copy_id"], "\\BE \\BE Improved")

    with outbox() as sent:
        (cid,) = await _propose(b, linked["group_id"], [linked["copy_id"]], "Typo fixed")
    assert len(mails_to(sent, linked["owner"].email)) == 1

    incoming = (await a.get(CONTRIB, params={"direction": "incoming"})).json()
    (item,) = [i for i in incoming if i["id"] == cid]
    assert item["kind"] == "version"
    assert item["counterpart_email"] == linked["contributor"].email
    assert (await a.get(f"{CONTRIB}/summary")).json()["incoming_pending"] >= 1
    detail = (await a.get(f"{CONTRIB}/{cid}")).json()
    assert "Improved" in detail["latex_body"]
    assert detail["base"]["id"] == linked["ex_id"]

    resp = await a.post(f"{CONTRIB}/{cid}/accept", json={})
    assert resp.status_code == 200, resp.text
    result_id = resp.json()["result_exercise_id"]
    new_row = (await a.get(f"{API}/{result_id}")).json()
    assert new_row["version"] == 2 and "Improved" in new_row["latex_body"]
    assert new_row["max_points"] == 2.0
    old_row = (await a.get(f"{API}/{linked['ex_id']}")).json()
    assert old_row["is_current"] is False
    view = (await a.get(f"/api/v1/exams/{exam.json()['id']}")).json()
    assert [e["id"] for e in view["exercises"]] == [linked["ex_id"]]

    # Decided: the payload is gone, and a second accept is refused.
    assert (await a.get(f"{CONTRIB}/{cid}")).json()["latex_body"] is None
    assert (await a.post(f"{CONTRIB}/{cid}/accept", json={})).status_code == 409


@pytest.mark.asyncio
async def test_variant_proposal_becomes_version_one_of_a_new_variant(linked) -> None:
    a, b = linked["a"], linked["b"]
    added = await b.post(
        f"{API}/{linked['copy_id']}/new-variant",
        json={"latex_body": "\\BE New context", "variant_key": "Zoo"},
    )
    assert added.status_code == 201, added.text
    (cid,) = await _propose(b, linked["group_id"], [added.json()["id"]])
    resp = await a.post(
        f"{CONTRIB}/{cid}/accept",
        json={"latex_body": "\\BE Edited by the author", "variant_key": "Animals"},
    )
    assert resp.status_code == 200, resp.text
    row = (await a.get(f"{API}/{resp.json()['result_exercise_id']}")).json()
    assert row["version"] == 1
    assert row["variant_key"] == "Animals"
    assert row["latex_body"] == "\\BE Edited by the author"


@pytest.mark.asyncio
async def test_unchanged_variant_cannot_be_proposed(linked) -> None:
    resp = await linked["b"].post(
        f"{API}/groups/{linked['group_id']}/contributions",
        json={"exercise_ids": [linked["copy_id"]]},
    )
    assert resp.status_code == 400
    assert resp.headers.get("code") == "ERR_NOT_CONTRIBUTABLE"


@pytest.mark.asyncio
async def test_only_participants_see_or_decide(linked) -> None:
    a, b, c = linked["a"], linked["b"], linked["c"]
    await _edit_copy(b, linked["copy_id"], "\\BE Changed")
    (cid,) = await _propose(b, linked["group_id"], [linked["copy_id"]])
    assert (await c.get(f"{CONTRIB}/{cid}")).status_code == 404
    assert (await c.post(f"{CONTRIB}/{cid}/accept", json={})).status_code == 404
    assert (await b.post(f"{CONTRIB}/{cid}/accept", json={})).status_code == 404
    assert (await a.post(f"{CONTRIB}/{cid}/withdraw")).status_code == 404
    # A group the bystander does not own is not theirs to propose from.
    resp = await c.post(
        f"{API}/groups/{linked['group_id']}/contributions",
        json={"exercise_ids": [linked["copy_id"]]},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_reject_and_withdraw_drop_the_payload(linked) -> None:
    a, b = linked["a"], linked["b"]
    await _edit_copy(b, linked["copy_id"], "\\BE First try")
    (first,) = await _propose(b, linked["group_id"], [linked["copy_id"]])
    resp = await a.post(f"{CONTRIB}/{first}/reject", json={"note": "Not needed"})
    assert resp.status_code == 204
    outgoing = (await b.get(CONTRIB, params={"direction": "outgoing"})).json()
    (item,) = [i for i in outgoing if i["id"] == first]
    assert item["status"] == "rejected" and item["decision_note"] == "Not needed"

    await _edit_copy(b, linked["copy_id"], "\\BE Second try")
    (second,) = await _propose(b, linked["group_id"], [linked["copy_id"]])
    assert (await b.post(f"{CONTRIB}/{second}/withdraw")).status_code == 204
    assert (await b.get(f"{CONTRIB}/{second}")).json()["latex_body"] is None


@pytest.mark.asyncio
async def test_a_newer_proposal_replaces_the_pending_one(linked) -> None:
    b = linked["b"]
    await _edit_copy(b, linked["copy_id"], "\\BE One")
    (first,) = await _propose(b, linked["group_id"], [linked["copy_id"]])
    (second,) = await _propose(b, linked["group_id"], [linked["copy_id"]])
    outgoing = (await b.get(CONTRIB, params={"direction": "outgoing"})).json()
    statuses = {i["id"]: i["status"] for i in outgoing}
    assert statuses[first] == "withdrawn" and statuses[second] == "pending"


@pytest.mark.asyncio
async def test_stale_target_falls_back_to_the_current_version(linked) -> None:
    a, b = linked["a"], linked["b"]
    await _edit_copy(b, linked["copy_id"], "\\BE Contributor wording")
    (cid,) = await _propose(b, linked["group_id"], [linked["copy_id"]])
    newer = await a.post(f"{API}/{linked['ex_id']}/new-version", json={"latex_body": "\\BE v2"})
    assert newer.status_code == 201, newer.text

    (item,) = [
        i for i in (await a.get(CONTRIB)).json() if i["id"] == cid
    ]
    assert item["stale"] is True and item["target_gone"] is False
    resp = await a.post(f"{CONTRIB}/{cid}/accept", json={})
    assert resp.status_code == 200, resp.text
    row = (await a.get(f"{API}/{resp.json()['result_exercise_id']}")).json()
    assert row["version"] == 3


@pytest.mark.asyncio
async def test_deleted_target_needs_accept_as_variant(linked) -> None:
    a, b = linked["a"], linked["b"]
    await _edit_copy(b, linked["copy_id"], "\\BE Keep me")
    (cid,) = await _propose(b, linked["group_id"], [linked["copy_id"]])
    assert (await a.delete(f"{API}/{linked['ex_id']}")).status_code == 204
    resp = await a.post(f"{CONTRIB}/{cid}/accept", json={})
    assert resp.status_code == 409
    assert resp.headers.get("code") == "ERR_CONTRIBUTION_TARGET_GONE"
    resp = await a.post(f"{CONTRIB}/{cid}/accept", json={"as_variant": True})
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_notice_mail_is_throttled(linked) -> None:
    b = linked["b"]
    await _edit_copy(b, linked["copy_id"], "\\BE Change")
    with outbox() as sent:
        await _propose(b, linked["group_id"], [linked["copy_id"]])
        await _propose(b, linked["group_id"], [linked["copy_id"]])
    assert len(mails_to(sent, linked["owner"].email)) == 1


@pytest.mark.asyncio
async def test_retention_drops_old_decided_proposals(linked, engine, monkeypatch) -> None:
    a, b = linked["a"], linked["b"]
    await _edit_copy(b, linked["copy_id"], "\\BE Old")
    (cid,) = await _propose(b, linked["group_id"], [linked["copy_id"]])
    assert (await a.post(f"{CONTRIB}/{cid}/reject", json={})).status_code == 204

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(retention, "AsyncSessionLocal", session_factory)
    async with session_factory() as session:
        row = await session.get(ExerciseContribution, uuid.UUID(cid))
        assert row is not None
        row.decided_at = datetime.now(UTC) - timedelta(days=60)
        await session.commit()
    await retention.run()
    async with session_factory() as session:
        gone = await session.execute(
            select(ExerciseContribution).where(ExerciseContribution.id == uuid.UUID(cid))
        )
        assert gone.scalar_one_or_none() is None
