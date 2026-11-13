"""Grading review records (issue #226): idempotent upsert per submission, exam-wide listing, trash-backed delete."""
from __future__ import annotations

import base64
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from .factors import sign_in

pytestmark = pytest.mark.asyncio

IV_B64 = base64.b64encode(b"123456789012").decode()


async def _exam_with_submission(
    client: AsyncClient, db: AsyncSession, email: str
) -> tuple[str, str, str]:
    """Returns (exam_id, exercise_id, submission_id) wired together."""
    await sign_in(client, db, email)

    ex_resp = await client.post(
        "/api/v1/exercises",
        json={"name": "Aufgabe 1", "latex_body": "\\Loesung{42}", "max_points": 5},
    )
    assert ex_resp.status_code == 201, ex_resp.text
    exercise_id = ex_resp.json()["id"]

    exam_resp = await client.post(
        "/api/v1/exams",
        json={
            "title": "Schulaufgabe",
            "retention_until": "2027-12-31",
            "exercise_links": [{"exercise_id": exercise_id, "order_index": 1}],
        },
    )
    assert exam_resp.status_code == 201, exam_resp.text
    exam_id = exam_resp.json()["id"]

    pseudonym_hmac = "a" * 64
    st_resp = await client.post(
        f"/api/v1/exams/{exam_id}/students",
        json={
            "pseudonym_hmac": pseudonym_hmac,
            "pii_ciphertext_b64": base64.b64encode(b"EncryptedPII").decode(),
            "iv_b64": IV_B64,
            "encryption_salt_b64": base64.b64encode(b"1234567890123456").decode(),
        },
    )
    assert st_resp.status_code == 201, st_resp.text

    sub_resp = await client.post(
        f"/api/v1/exams/{exam_id}/submissions",
        json={
            "pseudonym_hmac": pseudonym_hmac,
            "scan_ciphertext_b64": base64.b64encode(b"EncryptedScan").decode(),
            "scan_iv_b64": IV_B64,
        },
    )
    assert sub_resp.status_code == 201, sub_resp.text
    return exam_id, exercise_id, sub_resp.json()["id"]


async def test_put_is_an_idempotent_upsert(client: AsyncClient, db: AsyncSession) -> None:
    exam_id, _, sub_id = await _exam_with_submission(client, db, "reviews-upsert@example.com")
    url = f"/api/v1/exams/{exam_id}/submissions/{sub_id}/grading-review"
    assert (await client.get(url)).json() is None
    first = {"payload_ciphertext_b64": base64.b64encode(b"sealed-1").decode(), "payload_iv_b64": IV_B64}
    one = await client.put(url, json=first)
    assert one.status_code == 200, one.text
    second = {**first, "id": str(uuid.uuid4()), "payload_ciphertext_b64": base64.b64encode(b"sealed-2").decode()}
    two = await client.put(url, json=second)
    assert two.status_code == 200, two.text
    assert two.json()["id"] == one.json()["id"]
    assert base64.b64decode(two.json()["payload_ciphertext_b64"]) == b"sealed-2"
    assert (await client.get(url)).json()["id"] == one.json()["id"]
    listed = await client.get(f"/api/v1/exams/{exam_id}/grading-reviews")
    assert [r["submission_id"] for r in listed.json()] == [sub_id]


async def test_delete_is_idempotent_and_trashed(client: AsyncClient, db: AsyncSession) -> None:
    exam_id, _, sub_id = await _exam_with_submission(client, db, "reviews-delete@example.com")
    url = f"/api/v1/exams/{exam_id}/submissions/{sub_id}/grading-review"
    assert (await client.delete(url)).status_code == 204  # nothing there yet
    body = {"payload_ciphertext_b64": base64.b64encode(b"sealed").decode(), "payload_iv_b64": IV_B64}
    assert (await client.put(url, json=body)).status_code == 200
    assert (await client.delete(url)).status_code == 204
    assert (await client.get(url)).json() is None
    groups = (await client.get("/api/v1/trash")).json()["groups"]
    group = next(g for g in groups if any(e["kind"] == "grading_review" for e in g["entries"]))
    assert (await client.post(f"/api/v1/trash/{group['group_id']}/restore")).status_code == 200
    assert (await client.get(url)).json() is not None


async def test_submission_delete_takes_the_review_along(client: AsyncClient, db: AsyncSession) -> None:
    exam_id, _, sub_id = await _exam_with_submission(client, db, "reviews-cascade@example.com")
    url = f"/api/v1/exams/{exam_id}/submissions/{sub_id}/grading-review"
    body = {"payload_ciphertext_b64": base64.b64encode(b"sealed").decode(), "payload_iv_b64": IV_B64}
    assert (await client.put(url, json=body)).status_code == 200
    assert (await client.delete(f"/api/v1/exams/{exam_id}/submissions/{sub_id}")).status_code == 204
    from sqlalchemy import select

    from app.models.grading_review import GradingReview

    assert await db.scalar(select(GradingReview).where(GradingReview.submission_id == uuid.UUID(sub_id))) is None
