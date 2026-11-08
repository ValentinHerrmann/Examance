"""Pinned OMR templates (issue #239): idempotent, owner-only, sealed payload."""
from __future__ import annotations

import base64
import uuid
from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from .factors import sign_in, unique_email

pytestmark = pytest.mark.asyncio

IV_B64 = base64.b64encode(b"123456789012").decode()
HASH_A = "a" * 64
HASH_B = "b" * 64


def _body(payload: bytes = b"sealed-layout-0123456789", source: str = "printed") -> dict[str, str]:
    return {
        "source": source,
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


async def test_create_and_list_newest_first(client: AsyncClient, db: AsyncSession) -> None:
    exam_id = await _exam(client, db, unique_email("pins-list"))
    base = f"/api/v1/exams/{exam_id}/omr-template-pins"

    first = await client.put(f"{base}/{HASH_A}", json=_body())
    assert first.status_code == 200, first.text
    assert first.json()["layout_hash"] == HASH_A
    assert first.json()["source"] == "printed"
    await client.put(f"{base}/{HASH_B}", json=_body(source="download"))

    listed = await client.get(base)
    assert listed.status_code == 200
    assert [p["layout_hash"] for p in listed.json()] == [HASH_B, HASH_A]


async def test_reput_keeps_pinned_at_source_and_payload(
    client: AsyncClient, db: AsyncSession
) -> None:
    exam_id = await _exam(client, db, unique_email("pins-idem"))
    url = f"/api/v1/exams/{exam_id}/omr-template-pins/{HASH_A}"

    first = (await client.put(url, json=_body(b"first-payload-0123456"))).json()
    second = await client.put(url, json=_body(b"other-payload-0123456", source="download"))

    assert second.status_code == 200, second.text
    again = second.json()
    assert again["pinned_at"] == first["pinned_at"]
    assert again["source"] == "printed"
    assert again["payload_ciphertext_b64"] == first["payload_ciphertext_b64"]
    assert again["last_pinned_at"] >= first["last_pinned_at"]
    assert len((await client.get(url.rsplit("/", 1)[0])).json()) == 1


async def test_delete_then_404(client: AsyncClient, db: AsyncSession) -> None:
    exam_id = await _exam(client, db, unique_email("pins-del"))
    url = f"/api/v1/exams/{exam_id}/omr-template-pins/{HASH_A}"
    await client.put(url, json=_body())

    assert (await client.delete(url)).status_code == 204
    assert (await client.delete(url)).status_code == 404
    assert (await client.get(url.rsplit("/", 1)[0])).json() == []


async def test_foreign_exam_is_404(client: AsyncClient, db: AsyncSession) -> None:
    exam_id = await _exam(client, db, unique_email("pins-owner"))
    await client.put(f"/api/v1/exams/{exam_id}/omr-template-pins/{HASH_A}", json=_body())

    await sign_in(client, db, unique_email("pins-other"))
    base = f"/api/v1/exams/{exam_id}/omr-template-pins"
    assert (await client.get(base)).status_code == 404
    assert (await client.put(f"{base}/{HASH_A}", json=_body())).status_code == 404
    assert (await client.delete(f"{base}/{HASH_A}")).status_code == 404
    missing = f"/api/v1/exams/{uuid.uuid4()}/omr-template-pins"
    assert (await client.get(missing)).status_code == 404


async def test_admin_is_refused(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, unique_email("pins-admin"), role="admin")

    resp = await client.get(f"/api/v1/exams/{uuid.uuid4()}/omr-template-pins")

    assert resp.status_code == 403
    assert resp.headers.get("code") == "ERR_TEACHER_ROLE_REQUIRED"


async def test_bad_hash_is_422(client: AsyncClient, db: AsyncSession) -> None:
    exam_id = await _exam(client, db, unique_email("pins-hash"))
    base = f"/api/v1/exams/{exam_id}/omr-template-pins"

    assert (await client.put(f"{base}/{'A' * 64}", json=_body())).status_code == 422
    assert (await client.put(f"{base}/abc", json=_body())).status_code == 422


async def test_bad_payload_is_422(client: AsyncClient, db: AsyncSession) -> None:
    exam_id = await _exam(client, db, unique_email("pins-iv"))
    url = f"/api/v1/exams/{exam_id}/omr-template-pins/{HASH_A}"

    short_iv = {**_body(), "payload_iv_b64": base64.b64encode(b"short").decode()}
    assert (await client.put(url, json=short_iv)).status_code == 422
    not_b64 = {**_body(), "payload_ciphertext_b64": "***"}
    assert (await client.put(url, json=not_b64)).status_code == 422
    tiny = _body(b"tiny")
    assert (await client.put(url, json=tiny)).status_code == 422
    bad_source = {**_body(), "source": "other"}
    assert (await client.put(url, json=bad_source)).status_code == 422
