"""Per-exam pseudonym versions and the rekey that moves an exam to the keyed HMAC (issue #177)."""
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
from tests.factors import sign_in, unique_email


def _hex() -> str:
    return uuid.uuid4().hex * 2


def _student(pseudonym: str, version: int | None = None) -> dict[str, object]:
    body: dict[str, object] = {
        "pseudonym_hmac": pseudonym,
        "pii_ciphertext_b64": base64.b64encode(b"PII").decode(),
        "iv_b64": base64.b64encode(b"\x01" * 12).decode(),
        "encryption_salt_b64": base64.b64encode(b"\x02" * 16).decode(),
    }
    if version is not None:
        body["pseudonym_version"] = version
    return body


async def _exam(client: AsyncClient, version: int | None = None) -> str:
    body: dict[str, object] = {
        "title": "Rekey",
        "retention_until": (date.today() + timedelta(days=365)).isoformat(),
    }
    if version is not None:
        body["pseudonym_version"] = version
    res = await client.post("/api/v1/exams", json=body)
    assert res.status_code == 201, res.text
    return str(res.json()["id"])


async def _seeded(client: AsyncClient) -> tuple[str, str, str, str]:
    """A v1 exam with one student plus submission, and a submission whose identity is a placeholder."""
    exam_id = await _exam(client)
    named, placeholder = _hex(), _hex()
    assert (await client.post(f"/api/v1/exams/{exam_id}/students", json=_student(named))).status_code == 201
    for pseudonym in (named, placeholder):
        res = await client.post(
            f"/api/v1/exams/{exam_id}/submissions", json={"pseudonym_hmac": pseudonym}
        )
        assert res.status_code == 201, res.text
    sub = (await client.get(f"/api/v1/exams/{exam_id}/submissions")).json()[0]["id"]
    return exam_id, named, placeholder, sub


@pytest.mark.asyncio
async def test_rekey_renames_identities_and_submissions_and_moves_the_version(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, unique_email("rekey"))
    exam_id, named, placeholder, _ = await _seeded(client)

    listed = (await client.get(f"/api/v1/exams/{exam_id}/pseudonyms")).json()
    assert listed["pseudonym_version"] == 1
    assert set(listed["values"]) == {named, placeholder}

    pairs = [{"old": v, "new": _hex()} for v in listed["values"]]
    res = await client.post(
        f"/api/v1/exams/{exam_id}/pseudonyms/rekey",
        json={"from_version": 1, "to_version": 2, "pairs": pairs},
    )
    assert res.status_code == 200, res.text
    assert res.json() == {"changed": True, "pseudonym_version": 2, "renamed": 2}

    db.expire_all()
    exam_uuid = uuid.UUID(exam_id)
    identities = set(
        await db.scalars(select(StudentIdentity.pseudonym_hmac).where(StudentIdentity.exam_id == exam_uuid))
    )
    submissions = set(
        await db.scalars(select(ScanSubmission.pseudonym_hmac).where(ScanSubmission.exam_id == exam_uuid))
    )
    new_values = {p["new"] for p in pairs}
    assert identities == new_values
    assert submissions == new_values
    assert (await client.get(f"/api/v1/exams/{exam_id}")).json()["pseudonym_version"] == 2


@pytest.mark.asyncio
async def test_rekey_is_idempotent_and_refuses_incomplete_pairs(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, unique_email("rekey-repeat"))
    exam_id, named, placeholder, _ = await _seeded(client)
    url = f"/api/v1/exams/{exam_id}/pseudonyms/rekey"

    # Missing a value: nothing changes, not even the version.
    partial = await client.post(
        url, json={"from_version": 1, "to_version": 2, "pairs": [{"old": named, "new": _hex()}]}
    )
    assert partial.status_code == 422
    assert (await client.get(f"/api/v1/exams/{exam_id}/pseudonyms")).json()["pseudonym_version"] == 1

    # Unknown extra values are ignored; a repeat after success answers changed: false.
    pairs = [{"old": named, "new": _hex()}, {"old": placeholder, "new": _hex()}, {"old": _hex(), "new": _hex()}]
    body = {"from_version": 1, "to_version": 2, "pairs": pairs}
    assert (await client.post(url, json=body)).json()["changed"] is True
    again = await client.post(url, json=body)
    assert again.status_code == 200
    assert again.json() == {"changed": False, "pseudonym_version": 2, "renamed": 0}


@pytest.mark.asyncio
async def test_rekey_renames_soft_deleted_rows_too(client: AsyncClient, db: AsyncSession) -> None:
    """Rows soft-deleted by a storage-mode move stay keyed like the rest of the exam."""
    await sign_in(client, db, unique_email("rekey-deleted"))
    exam_id, named, placeholder, sub = await _seeded(client)
    assert (await client.post("/api/v1/user/purge-server-student-data")).status_code == 200

    values = (await client.get(f"/api/v1/exams/{exam_id}/pseudonyms")).json()["values"]
    assert set(values) == {named, placeholder}
    pairs = [{"old": v, "new": _hex()} for v in values]
    res = await client.post(
        f"/api/v1/exams/{exam_id}/pseudonyms/rekey",
        json={"from_version": 1, "to_version": 2, "pairs": pairs},
    )
    assert res.status_code == 200, res.text
    db.expire_all()
    deleted = (await db.execute(select(ScanSubmission).where(ScanSubmission.id == uuid.UUID(sub)))).scalar_one()
    assert deleted.pseudonym_hmac in {p["new"] for p in pairs}


@pytest.mark.asyncio
async def test_writes_keyed_for_another_version_are_refused_with_422(
    client: AsyncClient, db: AsyncSession
) -> None:
    """422, not 409: the offline queue counts a 409 as applied and would drop a stale write."""
    await sign_in(client, db, unique_email("rekey-guard"))
    v1_exam = await _exam(client)
    v2_exam = await _exam(client, version=2)

    # Older clients send no version and keep working on v1 exams.
    assert (await client.post(f"/api/v1/exams/{v1_exam}/students", json=_student(_hex()))).status_code == 201

    stale = await client.post(f"/api/v1/exams/{v2_exam}/students", json=_student(_hex()))
    assert stale.status_code == 422
    assert stale.headers.get("code") == "ERR_PSEUDONYM_VERSION"
    stale_sub = await client.post(
        f"/api/v1/exams/{v2_exam}/submissions", json={"pseudonym_hmac": _hex()}
    )
    assert stale_sub.status_code == 422

    keyed = await client.post(f"/api/v1/exams/{v2_exam}/students", json=_student(_hex(), version=2))
    assert keyed.status_code == 201
    keyed_sub = await client.post(
        f"/api/v1/exams/{v2_exam}/submissions",
        json={"pseudonym_hmac": _hex(), "pseudonym_version": 2},
    )
    assert keyed_sub.status_code == 201


@pytest.mark.asyncio
async def test_rekey_only_moves_forward(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, unique_email("rekey-forward"))
    exam_id = await _exam(client, version=2)
    res = await client.post(
        f"/api/v1/exams/{exam_id}/pseudonyms/rekey",
        json={"from_version": 2, "to_version": 1, "pairs": []},
    )
    assert res.status_code == 422
    assert (await client.get(f"/api/v1/exams/{exam_id}/pseudonyms")).json()["pseudonym_version"] == 2
