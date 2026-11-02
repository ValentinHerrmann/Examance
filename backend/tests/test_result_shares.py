"""Result sharing with students (issue #207): the server stores and returns only ciphertext, behind the link's lookup secret and an expiry."""
from __future__ import annotations

import base64
import hashlib
import os
import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.result_share import ResultShare
from app.services import result_shares

from .factors import sign_in

STUDENT = "a" * 64


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


async def _create_exam(client: AsyncClient) -> str:
    resp = await client.post(
        "/api/v1/exams",
        json={"title": "Shared exam", "retention_until": (date.today() + timedelta(days=30)).isoformat()},
    )
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


def _share(lookup: bytes, *, factor: str = "none", student: str = STUDENT, days: int = 30) -> dict[str, object]:
    return {
        "id": str(uuid.uuid4()),
        "student_key": student,
        "lookup_hash": hashlib.sha256(lookup).hexdigest(),
        "factor": factor,
        "kdf_salt_b64": None if factor == "none" else _b64(os.urandom(16)),
        "iv_b64": _b64(os.urandom(12)),
        "ciphertext_b64": _b64(b"sealed-pdf"),
        "expiry_days": days,
    }


@pytest.mark.asyncio
async def test_share_opens_only_with_its_lookup_secret(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "share-open@example.com")
    exam_id = await _create_exam(client)
    lookup = os.urandom(32)
    body = _share(lookup, factor="code")
    created = await client.post(f"/api/v1/exams/{exam_id}/shares", json=body)
    assert created.status_code == 201, created.text
    assert created.json()["factor"] == "code"

    client.cookies.clear()  # The student has no session.
    opened = await client.post(f"/api/v1/shares/{body['id']}/open", json={"lookup_b64": _b64(lookup)})
    assert opened.status_code == 200, opened.text
    assert base64.b64decode(opened.json()["ciphertext_b64"]) == b"sealed-pdf"
    assert opened.json()["kdf_salt_b64"] == body["kdf_salt_b64"]

    wrong = await client.post(f"/api/v1/shares/{body['id']}/open", json={"lookup_b64": _b64(os.urandom(32))})
    unknown = await client.post(f"/api/v1/shares/{uuid.uuid4()}/open", json={"lookup_b64": _b64(lookup)})
    # A wrong link and an unknown id answer alike.
    assert wrong.status_code == unknown.status_code == 404
    assert wrong.headers.get("code") == unknown.headers.get("code") == "ERR_SHARE_NOT_FOUND"


@pytest.mark.asyncio
async def test_resharing_a_student_replaces_the_old_link(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "share-replace@example.com")
    exam_id = await _create_exam(client)
    first_lookup, second_lookup = os.urandom(32), os.urandom(32)
    first = _share(first_lookup)
    second = _share(second_lookup)
    assert (await client.post(f"/api/v1/exams/{exam_id}/shares", json=first)).status_code == 201
    assert (await client.post(f"/api/v1/exams/{exam_id}/shares", json=second)).status_code == 201

    listed = (await client.get(f"/api/v1/exams/{exam_id}/shares")).json()
    assert [s["id"] for s in listed] == [second["id"]]
    old = await client.post(f"/api/v1/shares/{first['id']}/open", json={"lookup_b64": _b64(first_lookup)})
    assert old.status_code == 404


@pytest.mark.asyncio
async def test_share_input_is_validated(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "share-validate@example.com")
    exam_id = await _create_exam(client)
    bad_days = _share(os.urandom(32), days=365)
    assert (await client.post(f"/api/v1/exams/{exam_id}/shares", json=bad_days)).status_code == 400
    code_without_salt = {**_share(os.urandom(32), factor="code"), "kdf_salt_b64": None}
    assert (await client.post(f"/api/v1/exams/{exam_id}/shares", json=code_without_salt)).status_code == 400


@pytest.mark.asyncio
async def test_revoke_and_expiry_end_the_link(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "share-revoke@example.com")
    exam_id = await _create_exam(client)
    lookup = os.urandom(32)
    revoked = _share(lookup, student="b" * 64)
    expiring = _share(lookup := os.urandom(32), student="c" * 64)
    for body in (revoked, expiring):
        assert (await client.post(f"/api/v1/exams/{exam_id}/shares", json=body)).status_code == 201

    assert (await client.delete(f"/api/v1/exams/{exam_id}/shares/{revoked['id']}")).status_code == 204
    assert (await client.delete(f"/api/v1/exams/{exam_id}/shares/{revoked['id']}")).status_code == 404

    row = await db.scalar(select(ResultShare).where(ResultShare.id == uuid.UUID(str(expiring["id"]))))
    assert row is not None
    row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    await db.commit()
    gone = await client.post(f"/api/v1/shares/{expiring['id']}/open", json={"lookup_b64": _b64(lookup)})
    assert gone.status_code == 404
    assert await result_shares.purge_expired(db, datetime.now(UTC)) == 1
