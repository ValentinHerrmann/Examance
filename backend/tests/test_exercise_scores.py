"""Per-exercise score endpoints.

The behaviour under test is mostly about *not* failing: the bulk write has to be
replayable, and clearing a score that is not there has to be a no-op. Both
because the client reaches these endpoints from an offline-queue flush and from
a keystroke in the grading grid, where a 409 or a 404 would surface as a modal.
"""
from __future__ import annotations

import base64

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


async def test_bulk_put_is_idempotent(client: AsyncClient, db: AsyncSession) -> None:
    exam_id, exercise_id, sub_id = await _exam_with_submission(
        client, db, "scores-idempotent@example.com"
    )
    url = f"/api/v1/exams/{exam_id}/submissions/{sub_id}/scores"
    body = {
        "scores": [
            {
                "exercise_id": exercise_id,
                "payload_ciphertext_b64": base64.b64encode(b"sealed-score").decode(),
                "payload_iv_b64": IV_B64,
            }
        ]
    }

    first = await client.put(url, json=body)
    assert first.status_code == 200, first.text
    assert len(first.json()) == 1
    first_row_id = first.json()[0]["id"]

    # Replaying the same write — an offline-queue flush, a retried autosave —
    # must update in place, not answer 409 the way the create-only POSTs do.
    second = await client.put(url, json=body)
    assert second.status_code == 200, second.text
    assert len(second.json()) == 1
    assert second.json()[0]["id"] == first_row_id


async def test_put_ignores_a_stale_client_id_for_an_existing_pair(
    client: AsyncClient, db: AsyncSession
) -> None:
    exam_id, exercise_id, sub_id = await _exam_with_submission(
        client, db, "scores-staleid@example.com"
    )
    url = f"/api/v1/exams/{exam_id}/submissions/{sub_id}/scores"

    created = await client.put(
        url, json={"scores": [{"exercise_id": exercise_id, "payload_iv_b64": IV_B64}]}
    )
    row_id = created.json()[0]["id"]

    # The row's identity is (submission, exercise). A different client-supplied
    # id for the same pair updates that row rather than colliding.
    replayed = await client.put(
        url,
        json={
            "scores": [
                {
                    "id": "11111111-1111-4111-8111-111111111111",
                    "exercise_id": exercise_id,
                    "payload_iv_b64": IV_B64,
                }
            ]
        },
    )
    assert replayed.status_code == 200, replayed.text
    assert len(replayed.json()) == 1
    assert replayed.json()[0]["id"] == row_id


async def test_put_rejects_an_exercise_outside_the_exam(
    client: AsyncClient, db: AsyncSession
) -> None:
    exam_id, _exercise_id, sub_id = await _exam_with_submission(
        client, db, "scores-unlinked@example.com"
    )
    stray = await client.post(
        "/api/v1/exercises", json={"name": "Elsewhere", "latex_body": "x", "max_points": 1}
    )
    stray_id = stray.json()["id"]

    resp = await client.put(
        f"/api/v1/exams/{exam_id}/submissions/{sub_id}/scores",
        json={"scores": [{"exercise_id": stray_id, "payload_iv_b64": IV_B64}]},
    )
    assert resp.status_code == 404


async def test_delete_is_idempotent(client: AsyncClient, db: AsyncSession) -> None:
    exam_id, exercise_id, sub_id = await _exam_with_submission(
        client, db, "scores-delete@example.com"
    )
    url = f"/api/v1/exams/{exam_id}/submissions/{sub_id}/scores"
    await client.put(url, json={"scores": [{"exercise_id": exercise_id, "payload_iv_b64": IV_B64}]})

    assert (await client.delete(f"{url}/{exercise_id}")).status_code == 204
    # Clearing an already-clear score is the requested state, not an error: the
    # grading grid fires this on every cleared input.
    assert (await client.delete(f"{url}/{exercise_id}")).status_code == 204
    assert (await client.get(url)).json() == []


async def test_clear_grading_also_drops_per_exercise_scores(
    client: AsyncClient, db: AsyncSession
) -> None:
    exam_id, exercise_id, sub_id = await _exam_with_submission(
        client, db, "scores-cleargrading@example.com"
    )
    url = f"/api/v1/exams/{exam_id}/submissions/{sub_id}/scores"
    await client.put(url, json={"scores": [{"exercise_id": exercise_id, "payload_iv_b64": IV_B64}]})

    cleared = await client.delete(f"/api/v1/exams/{exam_id}/submissions/{sub_id}/grading")
    assert cleared.status_code == 204
    assert (await client.get(url)).json() == []


async def test_exam_wide_read_returns_every_submissions_scores(
    client: AsyncClient, db: AsyncSession
) -> None:
    exam_id, exercise_id, sub_id = await _exam_with_submission(
        client, db, "scores-examwide@example.com"
    )
    await client.put(
        f"/api/v1/exams/{exam_id}/submissions/{sub_id}/scores",
        json={"scores": [{"exercise_id": exercise_id, "payload_iv_b64": IV_B64}]},
    )

    resp = await client.get(f"/api/v1/exams/{exam_id}/scores")
    assert resp.status_code == 200, resp.text
    assert len(resp.json()) == 1
    assert resp.json()[0]["submission_id"] == sub_id


async def test_another_teacher_cannot_reach_the_scores(
    client: AsyncClient, db: AsyncSession
) -> None:
    exam_id, exercise_id, sub_id = await _exam_with_submission(
        client, db, "scores-owner@example.com"
    )
    url = f"/api/v1/exams/{exam_id}/submissions/{sub_id}/scores"
    await client.put(url, json={"scores": [{"exercise_id": exercise_id, "payload_iv_b64": IV_B64}]})

    client.cookies.clear()
    await sign_in(client, db, "scores-intruder@example.com")

    # get_exam_for_teacher answers 401 rather than 404 — never leaking whether
    # somebody else's exam exists.
    assert (await client.get(url)).status_code == 401
    assert (await client.get(f"/api/v1/exams/{exam_id}/scores")).status_code == 401
    assert (
        await client.put(url, json={"scores": [{"exercise_id": exercise_id}]})
    ).status_code == 401
