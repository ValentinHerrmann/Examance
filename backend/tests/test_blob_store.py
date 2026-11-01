"""Scan file partition (issue #114): guard, atomic writes, dual read, sweep."""
from __future__ import annotations

import base64
import os
import time
import uuid
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.scan_submission import ScanSubmission
from app.services import blob_store
from tests.test_api import _create_teacher_and_login


@pytest.fixture
def store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(settings, "BLOB_STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr(settings, "BLOB_STORAGE_BACKEND", "fs")
    blob_store.init()
    return tmp_path


def test_unmarked_dir_is_refused(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "BLOB_STORAGE_DIR", str(tmp_path))
    with pytest.raises(blob_store.BlobStoreUnavailable):
        blob_store.put_sync("scans", "e", "s", b"data")
    assert list(tmp_path.iterdir()) == []


def test_foreign_stack_dir_is_refused(store: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://other.example")
    with pytest.raises(blob_store.BlobStoreUnavailable):
        blob_store.root()


def test_put_get_and_ref_escape(store: Path) -> None:
    ref = blob_store.put_sync("scans", "e", "s", b"data")
    assert blob_store.get_sync(ref) == b"data"
    assert ref != blob_store.put_sync("scans", "e", "s", b"data")  # fresh file per write
    with pytest.raises(ValueError):
        blob_store.get_sync("../outside")


def test_sweep_keeps_referenced_and_fresh_files(store: Path) -> None:
    kept = blob_store.put_sync("scans", "e", "kept", b"1")
    fresh = blob_store.put_sync("scans", "e", "fresh", b"2")
    stale = blob_store.put_sync("scans", "e", "stale", b"3")
    old = time.time() - 2 * blob_store.SWEEP_MIN_AGE_SECONDS
    for ref in (kept, stale):
        os.utime(store / ref, (old, old))
    assert blob_store.sweep_sync("scans", {kept}) == 1
    assert {ref for ref, _ in blob_store.iter_refs("scans")} == {kept, fresh}


@pytest.mark.asyncio
async def test_scan_round_trip_through_files(
    client: AsyncClient, db: AsyncSession, store: Path
) -> None:
    await _create_teacher_and_login(client, db, f"blob-{uuid.uuid4().hex[:8]}@example.com")
    exam = await client.post(
        "/api/v1/exams", json={"title": "Blob exam", "retention_until": "2027-12-31"}
    )
    exam_id = exam.json()["id"]
    sub_id = str(uuid.uuid4())
    payload = {
        "id": sub_id,
        "pseudonym_hmac": "c" * 64,
        "scan_ciphertext_b64": base64.b64encode(b"first").decode(),
        "scan_iv_b64": base64.b64encode(b"123456789012").decode(),
    }
    created = await client.post(f"/api/v1/exams/{exam_id}/submissions", json=payload)
    assert created.status_code == 201, created.text
    assert created.json()["has_scan"] is True

    payload["scan_ciphertext_b64"] = base64.b64encode(b"second").decode()
    replaced = await client.post(f"/api/v1/exams/{exam_id}/submissions", json=payload)
    assert replaced.status_code == 201, replaced.text

    row = (
        await db.execute(select(ScanSubmission).where(ScanSubmission.id == uuid.UUID(sub_id)))
    ).scalar_one()
    assert row.scan_path is not None
    assert not row.scan_in_db
    # The replaced file was dropped after the commit.
    assert [ref for ref, _ in blob_store.iter_refs("scans")] == [row.scan_path]

    fetched = await client.get(f"/api/v1/exams/{exam_id}/submissions/{sub_id}")
    assert base64.b64decode(fetched.json()["scan_ciphertext_b64"]) == b"second"
    listed = await client.get(f"/api/v1/exams/{exam_id}/submissions")
    assert listed.json()[0]["has_scan"] is True


@pytest.mark.asyncio
async def test_erasing_a_student_removes_the_scan_files_of_their_submissions(
    client: AsyncClient, db: AsyncSession, store: Path
) -> None:
    await _create_teacher_and_login(client, db, f"erase-{uuid.uuid4().hex[:8]}@example.com")
    exam = await client.post(
        "/api/v1/exams", json={"title": "Erase exam", "retention_until": "2027-12-31"}
    )
    exam_id = exam.json()["id"]
    for pseudonym in ("d" * 64, "e" * 64):
        sub = await client.post(
            f"/api/v1/exams/{exam_id}/submissions",
            json={
                "pseudonym_hmac": pseudonym,
                "scan_ciphertext_b64": base64.b64encode(b"scan").decode(),
                "scan_iv_b64": base64.b64encode(b"123456789012").decode(),
            },
        )
        assert sub.status_code == 201, sub.text
    assert len(list(blob_store.iter_refs("scans"))) == 2

    erased = await client.delete(
        f"/api/v1/exams/{exam_id}/students/{'d' * 64}", params={"permanent": "true"}
    )
    assert erased.status_code == 204, erased.text

    # The FK cascade drops the row, not the file: only the other student's scan may remain.
    remaining = await db.execute(
        select(ScanSubmission.scan_path).where(ScanSubmission.exam_id == uuid.UUID(exam_id))
    )
    assert [ref for ref, _ in blob_store.iter_refs("scans")] == list(remaining.scalars())
