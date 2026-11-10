"""Exam statistics (issue #238): sealed per-exam record, owner-only, kept through exam deletes the teacher chose to keep."""
from __future__ import annotations

import base64
import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from .factors import sign_in, unique_email

pytestmark = pytest.mark.asyncio

IV_B64 = base64.b64encode(b"123456789012").decode()


def _body(payload: bytes = b"sealed-statistics-0123456789", at: datetime | None = None) -> dict[str, str]:
    return {
        "computed_at": (at or datetime.now(UTC)).isoformat(),
        "payload_ciphertext_b64": base64.b64encode(payload).decode(),
        "payload_iv_b64": IV_B64,
    }


async def _exam(client: AsyncClient, db: AsyncSession, email: str) -> str:
    await sign_in(client, db, email)
    resp = await client.post(
        "/api/v1/exams",
        json={"title": "Schulaufgabe", "retention_until": str(date.today() + timedelta(days=300))},
    )
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


async def test_put_replaces_and_lists(client: AsyncClient, db: AsyncSession) -> None:
    exam_id = await _exam(client, db, unique_email("stats-put"))
    url = f"/api/v1/exams/{exam_id}/statistics"
    first = await client.put(url, json=_body(b"first-payload-0123456"))
    assert first.status_code == 200, first.text
    second = await client.put(url, json=_body(b"second-payload-012345"))
    assert second.status_code == 200, second.text
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["keep_after_exam_delete"] is True

    listed = (await client.get("/api/v1/statistics")).json()
    assert [row["exam_id"] for row in listed] == [exam_id]
    assert listed[0]["payload_ciphertext_b64"] == base64.b64encode(b"second-payload-012345").decode()


async def test_replayed_old_write_keeps_the_newer_record(client: AsyncClient, db: AsyncSession) -> None:
    exam_id = await _exam(client, db, unique_email("stats-stale"))
    url = f"/api/v1/exams/{exam_id}/statistics"
    newer = await client.put(url, json=_body(b"newer-payload-0123456"))
    stale = await client.put(url, json=_body(b"stale-payload-0123456", at=datetime.now(UTC) - timedelta(days=3)))
    assert stale.status_code == 200
    assert stale.json()["payload_ciphertext_b64"] == newer.json()["payload_ciphertext_b64"]


async def test_fast_client_clock_cannot_freeze_the_record(client: AsyncClient, db: AsyncSession) -> None:
    """Regression: computed_at was the client's clock, so a browser a day ahead blocked every later update."""
    exam_id = await _exam(client, db, unique_email("stats-clock"))
    url = f"/api/v1/exams/{exam_id}/statistics"
    await client.put(url, json=_body(b"ahead-payload-0123456", at=datetime.now(UTC) + timedelta(days=1)))
    later = await client.put(url, json=_body(b"later-payload-0123456"))
    assert later.json()["payload_ciphertext_b64"] == base64.b64encode(b"later-payload-0123456").decode()


async def test_get_one_record(client: AsyncClient, db: AsyncSession) -> None:
    exam_id = await _exam(client, db, unique_email("stats-get"))
    url = f"/api/v1/exams/{exam_id}/statistics"
    missing = await client.get(url)
    assert missing.status_code == 200
    assert missing.json() is None
    put = (await client.put(url, json=_body())).json()
    assert (await client.get(url)).json()["id"] == put["id"]


async def test_foreign_and_admin_are_refused(client: AsyncClient, db: AsyncSession) -> None:
    exam_id = await _exam(client, db, unique_email("stats-owner"))
    stats_id = (await client.put(f"/api/v1/exams/{exam_id}/statistics", json=_body())).json()["id"]

    await sign_in(client, db, unique_email("stats-other"))
    assert (await client.put(f"/api/v1/exams/{exam_id}/statistics", json=_body())).status_code == 404
    assert (await client.get("/api/v1/statistics")).json() == []
    assert (await client.delete(f"/api/v1/statistics/{stats_id}")).status_code == 404
    keep = {"keep_after_exam_delete": False}
    assert (await client.patch(f"/api/v1/statistics/{stats_id}", json=keep)).status_code == 404

    await sign_in(client, db, unique_email("stats-admin"), role="admin")
    resp = await client.get("/api/v1/statistics")
    assert resp.status_code == 403
    assert resp.headers.get("code") == "ERR_TEACHER_ROLE_REQUIRED"


async def test_bad_payload_is_422(client: AsyncClient, db: AsyncSession) -> None:
    exam_id = await _exam(client, db, unique_email("stats-bad"))
    url = f"/api/v1/exams/{exam_id}/statistics"
    assert (await client.put(url, json=_body(b"tiny"))).status_code == 422
    short_iv = {**_body(), "payload_iv_b64": base64.b64encode(b"short").decode()}
    assert (await client.put(url, json=short_iv)).status_code == 422
    missing = f"/api/v1/exams/{uuid.uuid4()}/statistics"
    assert (await client.put(missing, json=_body())).status_code == 404


async def test_delete_then_404(client: AsyncClient, db: AsyncSession) -> None:
    exam_id = await _exam(client, db, unique_email("stats-del"))
    stats_id = (await client.put(f"/api/v1/exams/{exam_id}/statistics", json=_body())).json()["id"]
    assert (await client.delete(f"/api/v1/statistics/{stats_id}")).status_code == 204
    assert (await client.delete(f"/api/v1/statistics/{stats_id}")).status_code == 404
    assert (await client.get("/api/v1/statistics")).json() == []


@pytest.mark.parametrize("keep", [True, False])
async def test_erasing_the_exam_from_the_trash_honours_keep(
    client: AsyncClient, db: AsyncSession, keep: bool
) -> None:
    exam_id = await _exam(client, db, unique_email(f"stats-trash-{keep}"))
    stats_id = (await client.put(f"/api/v1/exams/{exam_id}/statistics", json=_body())).json()["id"]
    resp = await client.patch(f"/api/v1/statistics/{stats_id}", json={"keep_after_exam_delete": keep})
    assert resp.status_code == 200, resp.text
    group = str(uuid.uuid4())
    deleted = await client.delete(f"/api/v1/exams/{exam_id}", headers={"X-Trash-Group": group})
    assert deleted.status_code == 204

    # The trash entry still holds the exam, so the record stays either way.
    assert len((await client.get("/api/v1/statistics")).json()) == 1
    assert (await client.delete(f"/api/v1/trash/{group}")).status_code == 204

    remaining = (await client.get("/api/v1/statistics")).json()
    assert [row["exam_id"] for row in remaining] == ([exam_id] if keep else [])


async def test_restoring_the_exam_keeps_unkept_statistics(
    client: AsyncClient, db: AsyncSession
) -> None:
    """Restore reuses the trash purge; it must not erase a record the teacher only chose to drop on final deletion."""
    exam_id = await _exam(client, db, unique_email("stats-restore"))
    stats_id = (await client.put(f"/api/v1/exams/{exam_id}/statistics", json=_body())).json()["id"]
    await client.patch(f"/api/v1/statistics/{stats_id}", json={"keep_after_exam_delete": False})
    group = str(uuid.uuid4())
    await client.delete(f"/api/v1/exams/{exam_id}", headers={"X-Trash-Group": group})

    assert (await client.post(f"/api/v1/trash/{group}/restore")).status_code == 200
    assert [row["id"] for row in (await client.get("/api/v1/statistics")).json()] == [stats_id]
