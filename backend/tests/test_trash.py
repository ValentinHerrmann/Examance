"""Trash (issue #125): deletes keep a copy for the grace period; restore puts back only what is missing."""
from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.exercise import Exercise
from app.models.scan_submission import ScanSubmission
from app.models.trash_item import TrashItem
from app.services import blob_store, trash

from .factors import sign_in, unique_email
from .test_exercise_resources import PNG_B64
from .test_exercise_scores import IV_B64, _exam_with_submission

pytestmark = pytest.mark.asyncio


async def _score(client: AsyncClient, exam_id: str, sub_id: str, exercise_id: str) -> str:
    url = f"/api/v1/exams/{exam_id}/submissions/{sub_id}/scores"
    put = await client.put(
        url, json={"scores": [{"exercise_id": exercise_id, "payload_iv_b64": IV_B64}]}
    )
    assert put.status_code == 200, put.text
    return url


async def _groups(client: AsyncClient) -> list[dict[str, object]]:
    resp = await client.get("/api/v1/trash")
    assert resp.status_code == 200, resp.text
    groups: list[dict[str, object]] = resp.json()["groups"]
    return groups


async def test_deleting_a_scan_and_its_student_restores_as_one_group(
    client: AsyncClient, db: AsyncSession
) -> None:
    """Regression for issue #196: the UI's scan delete (submission, then student) left nothing to restore."""
    exam_id, exercise_id, sub_id = await _exam_with_submission(
        client, db, unique_email("trash-196")
    )
    url = await _score(client, exam_id, sub_id, exercise_id)
    group = str(uuid.uuid4())
    headers = {"X-Trash-Group": group}

    assert (await client.delete(f"/api/v1/exams/{exam_id}/submissions/{sub_id}", headers=headers)).status_code == 204
    assert (await client.delete(f"/api/v1/exams/{exam_id}/students/{'a' * 64}", headers=headers)).status_code == 204
    assert (await client.get(f"/api/v1/exams/{exam_id}/submissions/{sub_id}")).status_code == 404

    groups = await _groups(client)
    assert [g["group_id"] for g in groups] == [group]

    restored = await client.post(f"/api/v1/trash/{group}/restore")
    assert restored.status_code == 200, restored.text
    assert restored.json()["restored"] == {
        "student_identities": 1,
        "scan_submissions": 1,
        "exercise_scores": 1,
    }
    assert restored.json()["skipped"] == []
    assert (await client.get(f"/api/v1/exams/{exam_id}/submissions/{sub_id}")).status_code == 200
    assert len((await client.get(url)).json()) == 1
    students = (await client.get(f"/api/v1/exams/{exam_id}/students")).json()
    assert [s["pseudonym_hmac"] for s in students] == ["a" * 64]
    assert await _groups(client) == []


async def test_deleted_exam_comes_back_with_links_and_results(
    client: AsyncClient, db: AsyncSession
) -> None:
    exam_id, exercise_id, sub_id = await _exam_with_submission(
        client, db, unique_email("trash-exam")
    )
    await _score(client, exam_id, sub_id, exercise_id)
    assert (await client.delete(f"/api/v1/exams/{exam_id}")).status_code == 204
    assert (await client.get(f"/api/v1/exams/{exam_id}")).status_code == 404

    (group,) = await _groups(client)
    entries = group["entries"]
    assert isinstance(entries, list)
    assert entries[0]["kind"] == "exam"
    assert entries[0]["label"]["exam_title"] == "Schulaufgabe"

    restored = await client.post(f"/api/v1/trash/{group['group_id']}/restore")
    assert restored.status_code == 200, restored.text
    assert restored.json()["restored"]["exams"] == 1
    exam = await client.get(f"/api/v1/exams/{exam_id}")
    assert exam.status_code == 200
    linked = (await client.get(f"/api/v1/exams/{exam_id}/exercises")).json()
    assert [e["id"] for e in linked] == [exercise_id]
    assert (await client.get(f"/api/v1/exams/{exam_id}/submissions/{sub_id}")).status_code == 200


async def test_permanent_deletes_bypass_the_trash(client: AsyncClient, db: AsyncSession) -> None:
    exam_id, _, sub_id = await _exam_with_submission(client, db, unique_email("trash-perm"))
    params = {"permanent": "true"}
    assert (await client.delete(f"/api/v1/exams/{exam_id}/submissions/{sub_id}", params=params)).status_code == 204
    assert (await client.delete(f"/api/v1/exams/{exam_id}/students/{'a' * 64}", params=params)).status_code == 204
    assert await _groups(client) == []


async def test_clear_grading_is_refilled_only_while_still_empty(
    client: AsyncClient, db: AsyncSession
) -> None:
    exam_id, exercise_id, sub_id = await _exam_with_submission(
        client, db, unique_email("trash-grading")
    )
    url = await _score(client, exam_id, sub_id, exercise_id)
    sub_url = f"/api/v1/exams/{exam_id}/submissions/{sub_id}"
    assert (await client.patch(f"{sub_url}/score", json={"total_score": 4.5})).status_code == 200
    assert (await client.delete(f"{sub_url}/grading")).status_code == 204

    (group,) = await _groups(client)
    restored = await client.post(f"/api/v1/trash/{group['group_id']}/restore")
    assert restored.status_code == 200, restored.text
    assert restored.json()["restored"] == {"exercise_scores": 1, "scan_submissions": 1}
    assert (await client.get(sub_url)).json()["total_score"] == 4.5
    assert len((await client.get(url)).json()) == 1

    # Graded again since the clear: the restore never overwrites.
    assert (await client.delete(f"{sub_url}/grading")).status_code == 204
    assert (await client.patch(f"{sub_url}/score", json={"total_score": 1.0})).status_code == 200
    (group,) = await _groups(client)
    body = (await client.post(f"/api/v1/trash/{group['group_id']}/restore")).json()
    assert {"table": "scan_submissions", "id": sub_id, "reason": "changed_since"} in body["skipped"]
    assert (await client.get(sub_url)).json()["total_score"] == 1.0


async def test_rows_whose_parent_is_gone_are_reported(
    client: AsyncClient, db: AsyncSession
) -> None:
    exam_id, exercise_id, sub_id = await _exam_with_submission(
        client, db, unique_email("trash-parent")
    )
    url = await _score(client, exam_id, sub_id, exercise_id)
    assert (await client.delete(f"{url}/{exercise_id}")).status_code == 204
    (scores_group,) = await _groups(client)
    assert (await client.delete(f"/api/v1/exams/{exam_id}")).status_code == 204
    # Purge the exam's entry for good: the scores now have no submission to return to.
    groups = await _groups(client)
    exam_group = next(g for g in groups if g["group_id"] != scores_group["group_id"])
    assert (await client.delete(f"/api/v1/trash/{exam_group['group_id']}")).status_code == 204

    body = (await client.post(f"/api/v1/trash/{scores_group['group_id']}/restore")).json()
    assert body["restored"] == {}
    assert body["skipped"][0]["reason"] == "parent_missing"


async def test_deleted_current_version_takes_back_its_place(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, unique_email("trash-version"))
    first = await client.post(
        "/api/v1/exercises", json={"name": "Aufgabe", "latex_body": "v1", "max_points": 2}
    )
    assert first.status_code == 201, first.text
    second = await client.post(
        f"/api/v1/exercises/{first.json()['id']}/new-version", json={"latex_body": "v2"}
    )
    assert second.status_code in (200, 201), second.text
    v1, v2 = uuid.UUID(first.json()["id"]), uuid.UUID(second.json()["id"])

    assert (await client.delete(f"/api/v1/exercises/{v2}")).status_code == 204
    db.expire_all()
    assert (await db.get(Exercise, v1)).is_current  # type: ignore[union-attr]

    (group,) = await _groups(client)
    restored = await client.post(f"/api/v1/trash/{group['group_id']}/restore")
    assert restored.status_code == 200, restored.text
    assert restored.json()["skipped"] == []
    db.expire_all()
    assert (await db.get(Exercise, v2)).is_current  # type: ignore[union-attr]
    assert not (await db.get(Exercise, v1)).is_current  # type: ignore[union-attr]


async def test_deleted_resource_comes_back(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, unique_email("trash-files"))
    ex = await client.post(
        "/api/v1/exercises", json={"name": "Bild", "latex_body": "x", "max_points": 1}
    )
    ex_id = ex.json()["id"]
    res = await client.post(
        f"/api/v1/exercises/{ex_id}/resources",
        json={"filename": "fig.png", "content_b64": PNG_B64, "mime_type": "image/png"},
    )
    assert res.status_code in (200, 201), res.text
    res_id = res.json()["id"]
    assert (await client.delete(f"/api/v1/exercises/{ex_id}/resources/{res_id}")).status_code == 204

    (group,) = await _groups(client)
    restored = await client.post(f"/api/v1/trash/{group['group_id']}/restore")
    assert restored.json()["restored"] == {"exercise_resources": 1}
    listed = (await client.get(f"/api/v1/exercises/{ex_id}/resources")).json()
    assert [r["filename"] for r in listed] == ["fig.png"]


async def test_foreign_and_unknown_groups_are_the_same_404(
    client: AsyncClient, db: AsyncSession
) -> None:
    exam_id, _, sub_id = await _exam_with_submission(client, db, unique_email("trash-owner"))
    assert (await client.delete(f"/api/v1/exams/{exam_id}/submissions/{sub_id}")).status_code == 204
    (group,) = await _groups(client)

    await sign_in(client, db, unique_email("trash-intruder"))
    assert await _groups(client) == []
    for target in (group["group_id"], str(uuid.uuid4())):
        restore = await client.post(f"/api/v1/trash/{target}/restore")
        purge = await client.delete(f"/api/v1/trash/{target}")
        assert restore.status_code == purge.status_code == 404
        assert restore.headers["code"] == "ERR_TRASH_NOT_FOUND"


async def test_trash_keeps_scan_files_until_the_entry_is_erased(
    client: AsyncClient, db: AsyncSession, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "BLOB_STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr(settings, "BLOB_STORAGE_BACKEND", "fs")
    blob_store.init()
    exam_id, _, sub_id = await _exam_with_submission(client, db, unique_email("trash-blob"))
    ref = (
        await db.execute(select(ScanSubmission.scan_path).where(ScanSubmission.id == uuid.UUID(sub_id)))
    ).scalar_one()
    assert ref is not None
    assert (await client.delete(f"/api/v1/exams/{exam_id}/submissions/{sub_id}")).status_code == 204

    db.expire_all()
    assert ref in await trash.all_blob_refs(db)
    assert ref in {r for r, _ in blob_store.iter_refs("scans")}

    (group,) = await _groups(client)
    item = (
        await db.execute(select(TrashItem).where(TrashItem.group_id == uuid.UUID(str(group["group_id"]))))
    ).scalar_one()
    assert item.blob_refs == [ref]
    assert (await client.delete(f"/api/v1/trash/{group['group_id']}")).status_code == 204
    assert ref not in {r for r, _ in blob_store.iter_refs("scans")}


async def test_gdpr_erasure_also_erases_the_students_trash_entries(
    client: AsyncClient, db: AsyncSession
) -> None:
    exam_id, exercise_id, sub_id = await _exam_with_submission(
        client, db, unique_email("trash-gdpr")
    )
    url = await _score(client, exam_id, sub_id, exercise_id)
    assert (await client.delete(f"{url}/{exercise_id}")).status_code == 204
    assert len(await _groups(client)) == 1

    params = {"permanent": "true"}
    assert (await client.delete(f"/api/v1/exams/{exam_id}/submissions/{sub_id}", params=params)).status_code == 204
    assert (await client.delete(f"/api/v1/exams/{exam_id}/students/{'a' * 64}", params=params)).status_code == 204
    assert await _groups(client) == []
