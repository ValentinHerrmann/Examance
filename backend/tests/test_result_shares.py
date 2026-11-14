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


def _reviewable(lookup: bytes, *, hours: int = 48, updatable: bool = True) -> dict[str, object]:
    body = _share(lookup)
    body["review_until"] = (datetime.now(UTC) + timedelta(hours=hours)).isoformat()
    if updatable:
        body["wrapped_key_b64"] = _b64(os.urandom(76))
    return body


def _objection(lookup: bytes, data: bytes = b"sealed-objection") -> dict[str, str]:
    return {"lookup_b64": _b64(lookup), "iv_b64": _b64(os.urandom(12)), "ciphertext_b64": _b64(data)}


async def _open(client: AsyncClient, share_id: object, lookup: bytes) -> dict[str, object]:
    resp = await client.post(f"/api/v1/shares/{share_id}/open", json={"lookup_b64": _b64(lookup)})
    assert resp.status_code == 200, resp.text
    return dict(resp.json())


@pytest.mark.asyncio
async def test_objection_lifecycle_and_lock_after_open(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "share-review@example.com")
    exam_id = await _create_exam(client)
    lookup = os.urandom(32)
    body = _reviewable(lookup)
    assert (await client.post(f"/api/v1/exams/{exam_id}/shares", json=body)).status_code == 201
    base = f"/api/v1/exams/{exam_id}/shares/{body['id']}"
    teacher_cookies = dict(client.cookies)

    client.cookies.clear()
    assert (await _open(client, body["id"], lookup))["review"] is None
    assert (await client.post(f"/api/v1/shares/{body['id']}/review", json=_objection(lookup))).status_code == 204
    # Posting again replaces it.
    assert (await client.post(f"/api/v1/shares/{body['id']}/review", json=_objection(lookup, b"second"))).status_code == 204
    review = (await _open(client, body["id"], lookup))["review"]
    assert isinstance(review, dict)
    assert base64.b64decode(review["objection_ct_b64"]) == b"second"
    assert review["submitted_at"]
    assert review["opened_at"] is None

    # Withdrawing deletes it, a new one can follow.
    withdrawn = await client.post(f"/api/v1/shares/{body['id']}/review/withdraw", json={"lookup_b64": _b64(lookup)})
    assert withdrawn.status_code == 204
    assert (await _open(client, body["id"], lookup))["review"] is None
    assert (await client.post(f"/api/v1/shares/{body['id']}/review", json=_objection(lookup))).status_code == 204

    client.cookies.update(teacher_cookies)
    listed = (await client.get(f"/api/v1/exams/{exam_id}/shares")).json()
    assert listed[0]["review_submitted_at"]
    assert listed[0]["review_opened_at"] is None
    assert listed[0]["updatable"] is True
    reviews = (await client.get(f"/api/v1/exams/{exam_id}/reviews")).json()
    assert [r["share_id"] for r in reviews] == [body["id"]]
    assert reviews[0]["student_key"] == STUDENT
    assert (await client.post(f"{base}/review/open")).status_code == 204

    # Opened: locked for the student.
    client.cookies.clear()
    locked = await client.post(f"/api/v1/shares/{body['id']}/review", json=_objection(lookup))
    assert locked.status_code == 409
    assert locked.headers.get("code") == "ERR_REVIEW_CLOSED"
    gone = await client.post(f"/api/v1/shares/{body['id']}/review/withdraw", json={"lookup_b64": _b64(lookup)})
    assert gone.status_code == 409
    assert gone.headers.get("code") == "ERR_REVIEW_CLOSED"

    client.cookies.update(teacher_cookies)
    reply = {"iv_b64": _b64(os.urandom(12)), "ciphertext_b64": _b64(b"sealed-reply")}
    assert (await client.put(f"{base}/review/reply", json=reply)).status_code == 204
    client.cookies.clear()
    review = (await _open(client, body["id"], lookup))["review"]
    assert isinstance(review, dict)
    assert base64.b64decode(review["reply_ct_b64"]) == b"sealed-reply"
    assert review["replied_at"]
    assert review["opened_at"]


@pytest.mark.asyncio
async def test_objection_refused_after_deadline_or_when_off(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "share-review-deadline@example.com")
    exam_id = await _create_exam(client)
    off_lookup, late_lookup = os.urandom(32), os.urandom(32)
    off = _share(off_lookup, student="b" * 64)
    late = _reviewable(late_lookup)
    late["student_key"] = "c" * 64
    for body in (off, late):
        assert (await client.post(f"/api/v1/exams/{exam_id}/shares", json=body)).status_code == 201
    row = await db.scalar(select(ResultShare).where(ResultShare.id == uuid.UUID(str(late["id"]))))
    assert row is not None
    row.review_until = datetime.now(UTC) - timedelta(minutes=1)
    await db.commit()

    client.cookies.clear()
    disabled = await client.post(f"/api/v1/shares/{off['id']}/review", json=_objection(off_lookup))
    wrong = await client.post(f"/api/v1/shares/{late['id']}/review", json=_objection(os.urandom(32)))
    unknown = await client.post(f"/api/v1/shares/{uuid.uuid4()}/review", json=_objection(late_lookup))
    # Disabled, wrong-lookup and unknown answer alike.
    assert disabled.status_code == wrong.status_code == unknown.status_code == 404
    assert disabled.headers.get("code") == wrong.headers.get("code") == "ERR_SHARE_NOT_FOUND"
    closed = await client.post(f"/api/v1/shares/{late['id']}/review", json=_objection(late_lookup))
    assert closed.status_code == 409
    assert closed.headers.get("code") == "ERR_REVIEW_CLOSED"


@pytest.mark.asyncio
async def test_review_until_cannot_outlive_the_link(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "share-review-bound@example.com")
    exam_id = await _create_exam(client)
    body = _reviewable(os.urandom(32), hours=24 * 60)
    assert (await client.post(f"/api/v1/exams/{exam_id}/shares", json=body)).status_code == 400


@pytest.mark.asyncio
async def test_content_update_keeps_the_link_working(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "share-update@example.com")
    exam_id = await _create_exam(client)
    lookup = os.urandom(32)
    body = _reviewable(lookup)
    assert (await client.post(f"/api/v1/exams/{exam_id}/shares", json=body)).status_code == 201
    new_iv = os.urandom(12)
    update = {"iv_b64": _b64(new_iv), "ciphertext_b64": _b64(b"regraded-pdf")}
    assert (await client.put(f"/api/v1/exams/{exam_id}/shares/{body['id']}/content", json=update)).status_code == 204

    client.cookies.clear()
    opened = await _open(client, body["id"], lookup)
    assert base64.b64decode(str(opened["ciphertext_b64"])) == b"regraded-pdf"
    assert base64.b64decode(str(opened["iv_b64"])) == new_iv
    assert opened["content_updated_at"] is not None
    assert opened["review_until"] is not None


@pytest.mark.asyncio
async def test_share_without_wrapped_key_is_not_updatable(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "share-legacy@example.com")
    exam_id = await _create_exam(client)
    body = _share(os.urandom(32))
    assert (await client.post(f"/api/v1/exams/{exam_id}/shares", json=body)).status_code == 201
    assert (await client.get(f"/api/v1/exams/{exam_id}/shares")).json()[0]["updatable"] is False
    update = {"iv_b64": _b64(os.urandom(12)), "ciphertext_b64": _b64(b"x")}
    resp = await client.put(f"/api/v1/exams/{exam_id}/shares/{body['id']}/content", json=update)
    assert resp.status_code == 409
    assert resp.headers.get("code") == "ERR_SHARE_NOT_UPDATABLE"


@pytest.mark.asyncio
async def test_resharing_drops_the_old_review(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "share-review-reshare@example.com")
    exam_id = await _create_exam(client)
    lookup = os.urandom(32)
    body = _reviewable(lookup)
    assert (await client.post(f"/api/v1/exams/{exam_id}/shares", json=body)).status_code == 201
    teacher_cookies = dict(client.cookies)
    client.cookies.clear()
    assert (await client.post(f"/api/v1/shares/{body['id']}/review", json=_objection(lookup))).status_code == 204
    client.cookies.update(teacher_cookies)
    assert (await client.post(f"/api/v1/exams/{exam_id}/shares", json=_reviewable(os.urandom(32)))).status_code == 201
    assert (await client.get(f"/api/v1/exams/{exam_id}/reviews")).json() == []
