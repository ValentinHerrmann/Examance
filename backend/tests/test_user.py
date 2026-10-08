"""Unit tests for /api/v1/user endpoints (student data purge and restore)."""
from __future__ import annotations

import base64
import uuid
from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan_submission import ScanSubmission
from app.models.student_identity import StudentIdentity
from tests.test_api import _create_teacher_and_login


@pytest.mark.asyncio
async def test_purge_and_restore_student_data(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "purgeteacher@example.com")

    # 1. Create exam
    e_resp = await client.post(
        "/api/v1/exams",
        json={"title": "Purge Test Exam", "retention_until": "2027-12-31"},
    )
    assert e_resp.status_code == 201
    exam_id = e_resp.json()["id"]

    # 2. Add student identity & submission
    pseudo_hmac = "b" * 64
    st_resp = await client.post(
        f"/api/v1/exams/{exam_id}/students",
        json={
            "pseudonym_hmac": pseudo_hmac,
            "pii_ciphertext_b64": base64.b64encode(b"PII").decode(),
            "iv_b64": base64.b64encode(b"123456789012").decode(),
            "encryption_salt_b64": base64.b64encode(b"1234567890123456").decode(),
        },
    )
    assert st_resp.status_code == 201

    sub_resp = await client.post(
        f"/api/v1/exams/{exam_id}/submissions",
        json={
            "pseudonym_hmac": pseudo_hmac,
            "scan_ciphertext_b64": base64.b64encode(b"Scan").decode(),
            "scan_iv_b64": base64.b64encode(b"123456789012").decode(),
            "total_score": 90.0,
        },
    )
    assert sub_resp.status_code == 201

    # 3. Call purge endpoint
    purge_resp = await client.post("/api/v1/user/purge-server-student-data")
    assert purge_resp.status_code == 200
    purge_body = purge_resp.json()
    assert purge_body["status"] == "ok"
    assert purge_body["purged_student_identities"] == 1
    assert purge_body["purged_submissions"] == 1
    expected_retention = (date.today() + timedelta(days=7)).isoformat()
    assert purge_body["retention_until"] == expected_retention

    # Verify student identity & submission are soft-deleted with retention date
    st_row = (await db.execute(select(StudentIdentity).where(StudentIdentity.pseudonym_hmac == pseudo_hmac))).scalar_one()
    assert st_row.deleted_at is not None
    assert st_row.retention_until == date.today() + timedelta(days=7)

    sub_row = (await db.execute(select(ScanSubmission).where(ScanSubmission.pseudonym_hmac == pseudo_hmac))).scalar_one()
    assert sub_row.deleted_at is not None
    assert sub_row.retention_until == date.today() + timedelta(days=7)

    # 4. Call restore endpoint
    restore_resp = await client.post("/api/v1/user/restore-server-data")
    assert restore_resp.status_code == 200
    restore_body = restore_resp.json()
    assert restore_body["status"] == "ok"
    assert restore_body["restored_student_identities"] == 1
    assert restore_body["restored_submissions"] == 1

    # Refresh session identity map
    db.expire_all()

    # Verify rows are restored (deleted_at and retention_until cleared)
    st_row_restored = (await db.execute(select(StudentIdentity).where(StudentIdentity.pseudonym_hmac == pseudo_hmac))).scalar_one()
    assert st_row_restored.deleted_at is None
    assert st_row_restored.retention_until is None


def _student_payload(pseudonym: str, pii: bytes) -> dict[str, str]:
    return {
        "pseudonym_hmac": pseudonym,
        "pii_ciphertext_b64": base64.b64encode(pii).decode(),
        "iv_b64": base64.b64encode(b"\x01" * 12).decode(),
        "encryption_salt_b64": base64.b64encode(b"\x02" * 16).decode(),
    }


async def _purged_exam(client: AsyncClient, db: AsyncSession) -> tuple[str, str, str]:
    """An exam whose one identity and submission were purged (soft-deleted) from the server."""
    await _create_teacher_and_login(client, db, f"upsert-{uuid.uuid4().hex[:8]}@example.com")
    exam = await client.post(
        "/api/v1/exams", json={"title": "Upsert after purge", "retention_until": "2027-12-31"}
    )
    assert exam.status_code == 201, exam.text
    exam_id = exam.json()["id"]
    pseudonym = uuid.uuid4().hex * 2
    submission_id = str(uuid.uuid4())
    student = await client.post(
        f"/api/v1/exams/{exam_id}/students", json=_student_payload(pseudonym, b"old PII")
    )
    assert student.status_code == 201, student.text
    submission = await client.post(
        f"/api/v1/exams/{exam_id}/submissions",
        json={"id": submission_id, "pseudonym_hmac": pseudonym, "total_score": 3.0},
    )
    assert submission.status_code == 201, submission.text
    assert (await client.post("/api/v1/user/purge-server-student-data")).status_code == 200
    return exam_id, pseudonym, submission_id


@pytest.mark.asyncio
async def test_soft_deleted_identities_are_not_listed(
    client: AsyncClient, db: AsyncSession
) -> None:
    exam_id, _, _ = await _purged_exam(client, db)

    listed = await client.get(f"/api/v1/exams/{exam_id}/students")
    assert listed.status_code == 200
    assert listed.json() == []


@pytest.mark.asyncio
async def test_upserts_onto_soft_deleted_rows_make_them_live_again(
    client: AsyncClient, db: AsyncSession
) -> None:
    exam_id, pseudonym, submission_id = await _purged_exam(client, db)

    student = await client.post(
        f"/api/v1/exams/{exam_id}/students", json=_student_payload(pseudonym, b"new PII")
    )
    assert student.status_code == 201, student.text
    submission = await client.post(
        f"/api/v1/exams/{exam_id}/submissions",
        json={"id": submission_id, "pseudonym_hmac": pseudonym, "total_score": 4.0},
    )
    assert submission.status_code == 201, submission.text

    # Moving results back to the server verifies by listing them.
    assert len((await client.get(f"/api/v1/exams/{exam_id}/students")).json()) == 1
    assert len((await client.get(f"/api/v1/exams/{exam_id}/submissions")).json()) == 1

    db.expire_all()
    identity = (
        await db.execute(select(StudentIdentity).where(StudentIdentity.pseudonym_hmac == pseudonym))
    ).scalar_one()
    sub_row = await db.get(ScanSubmission, uuid.UUID(submission_id))
    assert sub_row is not None
    for row in (identity, sub_row):
        assert row.deleted_at is None
        assert row.retention_until is None
    assert identity.pii_ciphertext == b"new PII"
    assert sub_row.total_score == 4.0


@pytest.mark.asyncio
async def test_submission_upload_never_revives_deleted_pii(
    client: AsyncClient, db: AsyncSession
) -> None:
    exam_id, pseudonym, submission_id = await _purged_exam(client, db)

    submission = await client.post(
        f"/api/v1/exams/{exam_id}/submissions",
        json={"id": submission_id, "pseudonym_hmac": pseudonym},
    )
    assert submission.status_code == 201, submission.text

    db.expire_all()
    identity = (
        await db.execute(select(StudentIdentity).where(StudentIdentity.pseudonym_hmac == pseudonym))
    ).scalar_one()
    # Live again (its erasure would take the submission along), but only as the placeholder.
    assert identity.deleted_at is None
    assert identity.retention_until is None
    assert identity.pii_ciphertext == b"\x00"
