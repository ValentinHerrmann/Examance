"""Proposals from a linked copy back to the shared original (issue #65).

The owner's library changes only on an explicit accept, and only by a new version or a new
variant: an exam built on the previous row keeps it."""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.exercise_contribution import ExerciseContribution
from app.services import retention

from .factors import mails_to, outbox, sign_in

API = "/api/v1/exercises"
CONTRIB = f"{API}/contributions"


@pytest_asyncio.fixture
async def clients(client_factory) -> tuple[AsyncClient, AsyncClient, AsyncClient]:
    return await client_factory(3)


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


async def _status(b: AsyncClient, group_id: str) -> dict[str, Any]:
    (item,) = [s for s in (await b.get(f"{API}/sync-status")).json() if s["group_id"] == group_id]
    return dict(item)


@pytest.mark.asyncio
async def test_identical_accept_needs_no_update(linked) -> None:
    a, b = linked["a"], linked["b"]
    await _edit_copy(b, linked["copy_id"], "\\BE Better wording")
    (cid,) = await _propose(b, linked["group_id"], [linked["copy_id"]])
    assert (await a.post(f"{CONTRIB}/{cid}/accept", json={})).status_code == 200
    status = await _status(b, linked["group_id"])
    assert status["state"] == "up_to_date"
    assert status["changed_variants"] == 0
    assert status["locally_modified"] is False


@pytest.mark.asyncio
async def test_edited_accept_still_offers_the_update(linked) -> None:
    a, b = linked["a"], linked["b"]
    await _edit_copy(b, linked["copy_id"], "\\BE Better wording")
    (cid,) = await _propose(b, linked["group_id"], [linked["copy_id"]])
    resp = await a.post(f"{CONTRIB}/{cid}/accept", json={"latex_body": "\\BE Author's take"})
    assert resp.status_code == 200
    assert (await _status(b, linked["group_id"]))["state"] == "update_available"


@pytest.mark.asyncio
async def test_accepted_variant_links_the_contributors_variant(linked) -> None:
    a, b = linked["a"], linked["b"]
    added = await b.post(
        f"{API}/{linked['copy_id']}/new-variant",
        json={"latex_body": "\\BE Extra context", "variant_key": "Extra"},
    )
    (cid,) = await _propose(b, linked["group_id"], [added.json()["id"]])
    assert (await a.post(f"{CONTRIB}/{cid}/accept", json={})).status_code == 200
    status = await _status(b, linked["group_id"])
    assert status["state"] == "up_to_date"
    assert status["new_variants"] == 0 and status["local_variants"] == 0


@pytest.mark.asyncio
async def test_pending_tags_and_library_links_point_to_own_groups(linked) -> None:
    a, b = linked["a"], linked["b"]
    await _edit_copy(b, linked["copy_id"], "\\BE Tagged")
    (cid,) = await _propose(b, linked["group_id"], [linked["copy_id"]])
    owner_group = (await a.get(f"{API}/{linked['ex_id']}")).json()["exercise_group_id"]

    owner_summary = (await a.get(f"{CONTRIB}/summary")).json()
    assert {"group_id": owner_group, "incoming": 1, "outgoing": 0} in owner_summary[
        "pending_by_group"
    ]
    contributor_summary = (await b.get(f"{CONTRIB}/summary")).json()
    assert {"group_id": linked["group_id"], "incoming": 0, "outgoing": 1} in contributor_summary[
        "pending_by_group"
    ]

    (incoming,) = [i for i in (await a.get(CONTRIB)).json() if i["id"] == cid]
    assert incoming["library_group_id"] == owner_group
    outgoing = (await b.get(CONTRIB, params={"direction": "outgoing"})).json()
    (mine,) = [i for i in outgoing if i["id"] == cid]
    assert mine["library_group_id"] == linked["group_id"]


@pytest.mark.asyncio
async def test_a_reject_after_the_accept_is_refused(linked) -> None:
    a, b = linked["a"], linked["b"]
    await _edit_copy(b, linked["copy_id"], "\\BE Better")
    (cid,) = await _propose(b, linked["group_id"], [linked["copy_id"]])
    assert (await a.post(f"{CONTRIB}/{cid}/accept", json={})).status_code == 200
    resp = await a.post(f"{CONTRIB}/{cid}/reject", json={"note": "Too late"})
    assert resp.status_code == 409
    detail = (await a.get(f"{CONTRIB}/{cid}")).json()
    assert detail["status"] == "accepted" and detail["decision_note"] is None


@pytest.mark.asyncio
async def test_a_variant_key_taken_meanwhile_must_be_renamed(linked) -> None:
    a, b = linked["a"], linked["b"]
    added = await b.post(
        f"{API}/{linked['copy_id']}/new-variant",
        json={"latex_body": "\\BE Zoo context", "variant_key": "Zoo"},
    )
    (cid,) = await _propose(b, linked["group_id"], [added.json()["id"]])
    own = await a.post(
        f"{API}/{linked['ex_id']}/new-variant",
        json={"latex_body": "\\BE The author's zoo", "variant_key": "Zoo"},
    )
    assert own.status_code == 201, own.text
    taken = await a.post(f"{CONTRIB}/{cid}/accept", json={})
    assert taken.status_code == 409
    assert taken.headers.get("code") == "ERR_VARIANT_KEY_TAKEN"
    renamed = await a.post(f"{CONTRIB}/{cid}/accept", json={"variant_key": "Zoo 2"})
    assert renamed.status_code == 200, renamed.text
