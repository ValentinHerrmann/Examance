"""Exercise sharing, copy and resync (issue #65).

The invariant under test: a recipient's exams only ever reference the recipient's own rows, so an
owner's edit, unsharing or deletion never reaches them; a resync only adds versions."""
from __future__ import annotations

import base64
import uuid
from datetime import date, timedelta
from typing import Any

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.exercise_resource import ExerciseResource
from app.models.teacher import Teacher

from .factors import sign_in

API = "/api/v1/exercises"


@pytest_asyncio.fixture
async def clients(client_factory) -> tuple[AsyncClient, AsyncClient]:
    """Two independent clients so each teacher keeps its own cookie jar."""
    return await client_factory(2)


@pytest_asyncio.fixture
async def shared(clients, db: AsyncSession) -> dict[str, Any]:
    """Owner A shares one exercise (with a resource file); B is another account."""
    a, b = clients
    suffix = uuid.uuid4().hex[:8]
    owner = await sign_in(a, db, f"owner-{suffix}@example.com")
    other = await sign_in(b, db, f"colleague-{suffix}@example.com")
    created = await a.post(API, json={"name": "Shared task", "latex_body": "\\BE Original"})
    assert created.status_code == 201, created.text
    ex_id = created.json()["id"]
    await _put_resource(a, ex_id, b"figure-v1")
    resp = await a.put(f"{API}/{ex_id}/sharing", json={"shared": True})
    assert resp.status_code == 200, resp.text
    return {"a": a, "b": b, "owner": owner, "other": other, "ex_id": ex_id}


async def _put_resource(client: AsyncClient, ex_id: str, content: bytes) -> None:
    resp = await client.post(
        f"{API}/{ex_id}/resources",
        json={"filename": "figure.png", "mime_type": "image/png",
              "content_b64": base64.b64encode(content).decode("ascii")},
    )
    assert resp.status_code == 201, resp.text


async def _copy(b: AsyncClient, ex_id: str) -> dict[str, Any]:
    resp = await b.post(f"{API}/{ex_id}/copy")
    assert resp.status_code == 201, resp.text
    return dict(resp.json())


async def _status(b: AsyncClient, group_id: str) -> dict[str, Any]:
    resp = await b.get(f"{API}/sync-status")
    assert resp.status_code == 200, resp.text
    (item,) = [s for s in resp.json() if s["group_id"] == group_id]
    return dict(item)


async def _exam_with(client: AsyncClient, exercise_id: str) -> Any:
    return await client.post(
        "/api/v1/exams",
        json={
            "title": "Exam",
            "retention_until": (date.today() + timedelta(days=30)).isoformat(),
            "exercise_ids": [exercise_id],
        },
    )


@pytest.mark.asyncio
async def test_shared_listing_shows_email_but_no_owner_id(shared) -> None:
    b, ex_id = shared["b"], shared["ex_id"]
    resp = await b.get(f"{API}/shared")
    assert resp.status_code == 200, resp.text
    (row,) = [r for r in resp.json() if r["id"] == ex_id]
    assert row["shared_by_email"] == shared["owner"].email
    assert "teacher_id" not in row and "exam_id" not in row
    # The own library never mixes in foreign rows.
    own = await b.get(API)
    assert ex_id not in [r["id"] for r in own.json()]


@pytest.mark.asyncio
async def test_switch_off_hides_sharing_for_viewer_and_owner(shared, db: AsyncSession) -> None:
    b, ex_id = shared["b"], shared["ex_id"]
    await db.execute(
        update(Teacher).where(Teacher.id == shared["other"].id).values(allow_exercise_sharing=False)
    )
    await db.commit()
    assert (await b.get(f"{API}/shared")).status_code == 403
    assert (await b.post(f"{API}/{ex_id}/copy")).status_code == 403

    await db.execute(
        update(Teacher).where(Teacher.id == shared["other"].id).values(allow_exercise_sharing=True)
    )
    await db.execute(
        update(Teacher).where(Teacher.id == shared["owner"].id).values(allow_exercise_sharing=False)
    )
    await db.commit()
    resp = await b.get(f"{API}/shared")
    assert ex_id not in [r["id"] for r in resp.json()]
    assert (await b.get(f"{API}/{ex_id}")).status_code == 404


@pytest.mark.asyncio
async def test_non_owner_cannot_toggle_sharing(shared) -> None:
    b, ex_id = shared["b"], shared["ex_id"]
    assert (await b.put(f"{API}/{ex_id}/sharing", json={"shared": False})).status_code == 404


@pytest.mark.asyncio
async def test_shared_source_cannot_be_linked_into_exam(shared) -> None:
    assert (await _exam_with(shared["b"], shared["ex_id"])).status_code == 404


@pytest.mark.asyncio
async def test_copy_is_independent_of_the_original(shared) -> None:
    a, b, ex_id = shared["a"], shared["b"], shared["ex_id"]
    copied = await _copy(b, ex_id)
    (copy_row,) = copied["exercises"]
    assert copy_row["id"] != ex_id
    assert copy_row["is_shared"] is False
    files = await b.get(f"{API}/{copy_row['id']}/resources")
    assert [f["filename"] for f in files.json()] == ["figure.png"]

    exam = await _exam_with(b, copy_row["id"])
    assert exam.status_code == 201, exam.text

    assert (await a.delete(f"{API}/{ex_id}")).status_code == 204
    view = await b.get(f"/api/v1/exams/{exam.json()['id']}")
    assert [e["id"] for e in view.json()["exercises"]] == [copy_row["id"]]
    assert (await _status(b, copied["group_id"]))["state"] == "source_unavailable"


@pytest.mark.asyncio
async def test_source_edits_are_detected(shared) -> None:
    a, b, ex_id = shared["a"], shared["b"], shared["ex_id"]
    copied = await _copy(b, ex_id)
    group_id = copied["group_id"]
    assert (await _status(b, group_id))["state"] == "up_to_date"

    # A resource replaced in place (same name, new bytes) counts as a change.
    await _put_resource(a, ex_id, b"figure-v2")
    status = await _status(b, group_id)
    assert status["state"] == "update_available"
    assert status["changed_variants"] == 1
    assert status["locally_modified"] is False

    (copy_row,) = copied["exercises"]
    await b.patch(f"{API}/{copy_row['id']}", json={"latex_body": "\\BE My own wording"})
    assert (await _status(b, group_id))["locally_modified"] is True


@pytest.mark.asyncio
async def test_resync_adds_a_version_and_checks_the_reviewed_source(shared) -> None:
    a, b, ex_id = shared["a"], shared["b"], shared["ex_id"]
    copied = await _copy(b, ex_id)
    group_id = copied["group_id"]
    (copy_row,) = copied["exercises"]
    exam = await _exam_with(b, copy_row["id"])
    assert exam.status_code == 201, exam.text

    await a.patch(f"{API}/{ex_id}", json={"latex_body": "\\BE \\BE Corrected"})
    preview = (await b.get(f"{API}/groups/{group_id}/resync-preview")).json()
    (variant,) = preview["variants"]
    assert variant["kind"] == "changed"
    reviewed = {variant["source_exercise_id"]: variant["source_fingerprint"]}

    stale = {variant["source_exercise_id"]: "0" * 64}
    resp = await b.post(f"{API}/groups/{group_id}/resync", json={"source_fingerprints": stale})
    assert resp.status_code == 409, resp.text

    resp = await b.post(f"{API}/groups/{group_id}/resync", json={"source_fingerprints": reviewed})
    assert resp.status_code == 200, resp.text
    (new_row,) = resp.json()
    assert new_row["id"] != copy_row["id"]
    assert new_row["version"] == copy_row["version"] + 1
    assert "Corrected" in new_row["latex_body"]
    assert new_row["max_points"] == 2.0

    # The exam keeps the row it was built from; the old row is history, not overwritten.
    view = await b.get(f"/api/v1/exams/{exam.json()['id']}")
    (linked,) = view.json()["exercises"]
    assert linked["id"] == copy_row["id"]
    assert "Original" in linked["latex_body"]
    assert (await _status(b, group_id))["state"] == "up_to_date"


@pytest.mark.asyncio
async def test_unsharing_makes_the_source_unavailable(shared) -> None:
    a, b, ex_id = shared["a"], shared["b"], shared["ex_id"]
    copied = await _copy(b, ex_id)
    assert (await a.put(f"{API}/{ex_id}/sharing", json={"shared": False})).status_code == 200
    assert (await _status(b, copied["group_id"]))["state"] == "source_unavailable"
    assert (await b.post(f"{API}/{ex_id}/copy")).status_code == 404
    resp = await b.post(f"{API}/groups/{copied['group_id']}/resync", json={})
    assert resp.status_code == 404


async def _add_variant(client: AsyncClient, ex_id: str, key: str, body: str) -> str:
    resp = await client.post(
        f"{API}/{ex_id}/new-variant", json={"latex_body": body, "variant_key": key}
    )
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


@pytest.mark.asyncio
async def test_resync_takes_only_selected_variants_and_stores_edits(shared) -> None:
    a, b, ex_id = shared["a"], shared["b"], shared["ex_id"]
    other_id = await _add_variant(a, ex_id, "B", "\\BE Variant B")
    copied = await _copy(b, ex_id)
    group_id = copied["group_id"]

    await a.patch(f"{API}/{ex_id}", json={"latex_body": "\\BE Original fixed"})
    await a.patch(f"{API}/{other_id}", json={"latex_body": "\\BE Variant B fixed"})
    preview = (await b.get(f"{API}/groups/{group_id}/resync-preview")).json()
    changed = [v for v in preview["variants"] if v["kind"] == "changed"]
    assert len(changed) == 2
    first = changed[0]
    sid = first["source_exercise_id"]

    resp = await b.post(
        f"{API}/groups/{group_id}/resync",
        json={
            "source_fingerprints": {sid: first["source_fingerprint"]},
            "overrides": {sid: {"latex_body": "\\BE \\BE Merged by hand"}},
        },
    )
    assert resp.status_code == 200, resp.text
    (row,) = resp.json()
    assert row["latex_body"] == "\\BE \\BE Merged by hand"
    assert row["max_points"] == 2.0

    status = await _status(b, group_id)
    assert status["state"] == "update_available"
    assert status["changed_variants"] == 1
    assert status["locally_modified"] is True


@pytest.mark.asyncio
async def test_resync_rejects_overrides_outside_the_selection(shared) -> None:
    a, b, ex_id = shared["a"], shared["b"], shared["ex_id"]
    copied = await _copy(b, ex_id)
    await a.patch(f"{API}/{ex_id}", json={"latex_body": "\\BE Changed"})
    resp = await b.post(
        f"{API}/groups/{copied['group_id']}/resync",
        json={"source_fingerprints": {}, "overrides": {ex_id: {"latex_body": "x"}}},
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_pause_hides_and_resume_restores(shared) -> None:
    a, b, ex_id = shared["a"], shared["b"], shared["ex_id"]
    assert (await a.put(f"{API}/sharing/pause", json={"paused": True})).status_code == 204
    assert ex_id not in [r["id"] for r in (await b.get(f"{API}/shared")).json()]
    caps = (await a.get("/api/v1/user/capabilities")).json()
    assert caps["sharing_paused"] is True
    assert (await a.put(f"{API}/sharing/pause", json={"paused": False})).status_code == 204
    assert ex_id in [r["id"] for r in (await b.get(f"{API}/shared")).json()]


@pytest.mark.asyncio
async def test_copies_are_never_shared_as_ones_own(shared) -> None:
    b, ex_id = shared["b"], shared["ex_id"]
    copied = await _copy(b, ex_id)
    (row,) = copied["exercises"]
    resp = await b.put(f"{API}/{row['id']}/sharing", json={"shared": True})
    assert resp.status_code == 400
    assert resp.headers.get("code") == "ERR_SHARE_COPY"

    own = await b.post(API, json={"name": "Own task", "latex_body": "\\BE Mine"})
    bulk = await b.post(f"{API}/sharing/bulk", json={"shared": True})
    assert bulk.status_code == 200, bulk.text
    assert bulk.json()["skipped_copies"] == 1
    listing = {r["id"]: r for r in (await b.get(API)).json()}
    assert listing[own.json()["id"]]["is_shared"] is True
    assert listing[row["id"]]["is_shared"] is False
    assert listing[row["id"]]["group_copied"] is True

    off = await b.post(f"{API}/sharing/bulk", json={"shared": False})
    assert off.status_code == 200
    assert (await b.get(API)).json()[0]["is_shared"] is False


@pytest.mark.asyncio
async def test_copy_equal_to_the_changed_source_is_in_sync(shared) -> None:
    a, b, ex_id = shared["a"], shared["b"], shared["ex_id"]
    copied = await _copy(b, ex_id)
    (row,) = copied["exercises"]
    await a.patch(f"{API}/{ex_id}", json={"latex_body": "\\BE Same fix"})
    await b.patch(f"{API}/{row['id']}", json={"latex_body": "\\BE Same fix"})
    status = await _status(b, copied["group_id"])
    assert status["state"] == "up_to_date"
    assert status["locally_modified"] is False


@pytest.mark.asyncio
async def test_a_moved_copy_taints_its_new_group(shared) -> None:
    b, ex_id = shared["b"], shared["ex_id"]
    (row,) = (await _copy(b, ex_id))["exercises"]
    own = (await b.post(API, json={"name": "Own task", "latex_body": "\\BE Mine"})).json()
    moved = await b.patch(f"{API}/{row['id']}", json={"exercise_group_id": own["exercise_group_id"]})
    assert moved.status_code == 200, moved.text
    resp = await b.put(f"{API}/{own['id']}/sharing", json={"shared": True})
    assert resp.status_code == 400
    assert resp.headers.get("code") == "ERR_SHARE_COPY"


@pytest.mark.asyncio
async def test_audit_tells_consent_from_withdrawal(shared, db: AsyncSession) -> None:
    a, ex_id, owner = shared["a"], shared["ex_id"], shared["owner"]
    await a.put(f"{API}/{ex_id}/sharing", json={"shared": False})
    await a.put(f"{API}/sharing/pause", json={"paused": True})
    await a.put(f"{API}/sharing/pause", json={"paused": False})
    actions = set(
        (await db.execute(select(AuditLog.action).where(AuditLog.teacher_id == owner.id)))
        .scalars()
        .all()
    )
    assert {
        "EXERCISE_SHARED",
        "EXERCISE_UNSHARED",
        "EXERCISE_SHARING_PAUSED",
        "EXERCISE_SHARING_RESUMED",
    } <= actions


@pytest.mark.asyncio
async def test_a_recipients_read_never_writes_the_owners_rows(shared, db: AsyncSession) -> None:
    b, ex_id = shared["b"], shared["ex_id"]
    copied = await _copy(b, ex_id)
    # An owner file hashed by neither upload nor migration (rows older than 0032's backfill).
    await db.execute(
        update(ExerciseResource)
        .where(ExerciseResource.exercise_id == uuid.UUID(ex_id))
        .values(content_sha256=None)
    )
    await db.commit()
    assert (await _status(b, copied["group_id"]))["state"] == "up_to_date"
    stored = await db.scalar(
        select(ExerciseResource.content_sha256).where(
            ExerciseResource.exercise_id == uuid.UUID(ex_id)
        )
    )
    assert stored is None
