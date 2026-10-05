"""Exam header logos (issue #46): account logo, per-exam override, compile integration."""
from __future__ import annotations

import base64
from datetime import date, timedelta
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from .factors import sign_in

PNG = b"\x89PNG\r\n\x1a\n" + b"pretend-logo"
PDF = b"%PDF-1.4 pretend-logo"


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


async def _create_exam(client: AsyncClient) -> str:
    resp = await client.post(
        "/api/v1/exams",
        json={
            "title": "Logo exam",
            "retention_until": (date.today() + timedelta(days=30)).isoformat(),
        },
    )
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


@pytest.mark.asyncio
async def test_account_logo_roundtrip(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "logo-account@example.com")

    assert (await client.get("/api/v1/user/logo")).json()["source"] == "none"
    assert (await client.get("/api/v1/user/logo/file")).status_code == 404

    put = await client.put("/api/v1/user/logo", json={"content_b64": _b64(PNG)})
    assert put.status_code == 200, put.text
    # The type comes from the bytes, not from anything the client says.
    assert put.json()["mime_type"] == "image/png"

    file = await client.get("/api/v1/user/logo/file")
    assert file.content == PNG
    assert file.headers["x-content-type-options"] == "nosniff"

    assert (await client.delete("/api/v1/user/logo")).status_code == 204
    assert (await client.get("/api/v1/user/logo")).json()["source"] == "none"


@pytest.mark.asyncio
async def test_non_image_logo_is_refused(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "logo-svg@example.com")
    resp = await client.put("/api/v1/user/logo", json={"content_b64": _b64(b"<svg/>")})
    assert resp.status_code == 422
    assert resp.headers.get("code") == "ERR_LOGO_INVALID"


@pytest.mark.asyncio
async def test_exam_follows_account_until_overridden(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "logo-exam@example.com")
    await client.put("/api/v1/user/logo", json={"content_b64": _b64(PNG)})
    exam_id = await _create_exam(client)

    info = (await client.get(f"/api/v1/exams/{exam_id}/logo")).json()
    assert (info["mode"], info["source"]) == ("account", "account")

    custom = await client.put(
        f"/api/v1/exams/{exam_id}/logo", json={"mode": "custom", "content_b64": _b64(PDF)}
    )
    assert custom.status_code == 200, custom.text
    assert (custom.json()["source"], custom.json()["mime_type"]) == ("exam", "application/pdf")
    assert (await client.get(f"/api/v1/exams/{exam_id}/logo/file")).content == PDF

    none = (await client.put(f"/api/v1/exams/{exam_id}/logo", json={"mode": "none"})).json()
    assert none["source"] == "none"
    assert (await client.get(f"/api/v1/exams/{exam_id}/logo/file")).status_code == 404

    # Back to the account logo; a custom choice without a stored file is refused.
    back = (await client.put(f"/api/v1/exams/{exam_id}/logo", json={"mode": "account"})).json()
    assert back["source"] == "account"
    refused = await client.put(f"/api/v1/exams/{exam_id}/logo", json={"mode": "custom"})
    assert refused.status_code == 422


@pytest.mark.asyncio
async def test_compile_writes_the_exam_logo(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "logo-compile@example.com")
    await client.put("/api/v1/user/logo", json={"content_b64": _b64(PNG)})
    exam_id = await _create_exam(client)

    seen: list[object] = []

    async def fake_compile(latex, extra_files=None, preview=True, binary_files=None, logo=None):
        seen.append(logo)
        return b"%PDF-1.4 fake"

    with patch("app.routers.compile.compile_latex", side_effect=fake_compile):
        for body in (
            {"logo_exam_id": exam_id},
            {"account_logo": True},
            {},
        ):
            resp = await client.post(
                "/api/v1/compile/latex", json={"latex": "\\documentclass{article}", **body}
            )
            assert resp.status_code == 200, resp.text

    exam_logo, account_logo, no_logo = seen
    assert getattr(exam_logo, "filename", None) == "examance-logo.png"
    assert getattr(account_logo, "content", None) == PNG
    assert no_logo is None


@pytest.mark.asyncio
async def test_compile_never_reads_another_teachers_exam_logo(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, "logo-owner@example.com")
    exam_id = await _create_exam(client)
    await client.put(
        f"/api/v1/exams/{exam_id}/logo", json={"mode": "custom", "content_b64": _b64(PDF)}
    )

    client.cookies.clear()
    await sign_in(client, db, "logo-intruder@example.com")
    assert (await client.get(f"/api/v1/exams/{exam_id}/logo/file")).status_code == 401

    seen: list[object] = []

    async def fake_compile(latex, extra_files=None, preview=True, binary_files=None, logo=None):
        seen.append(logo)
        return b"%PDF-1.4 fake"

    with patch("app.routers.compile.compile_latex", side_effect=fake_compile):
        resp = await client.post(
            "/api/v1/compile/latex",
            json={"latex": "\\documentclass{article}", "logo_exam_id": exam_id},
        )
    assert resp.status_code == 200
    # Falls back to the intruder's own (absent) account logo.
    assert seen == [None]


@pytest.mark.asyncio
async def test_logo_names_are_reserved_for_resources(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "logo-reserved@example.com")
    ex = await client.post(
        "/api/v1/exercises", json={"name": "Ex", "latex_body": "x", "max_points": 1}
    )
    resp = await client.post(
        f"/api/v1/exercises/{ex.json()['id']}/resources",
        json={"filename": "examance-logo.png", "content_b64": _b64(PNG)},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_account_export_carries_the_logos(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "logo-export@example.com")
    await client.put("/api/v1/user/logo", json={"content_b64": _b64(PNG)})
    exam_id = await _create_exam(client)
    await client.put(
        f"/api/v1/exams/{exam_id}/logo", json={"mode": "custom", "content_b64": _b64(PDF)}
    )

    export = (await client.get("/api/v1/user/me/export")).json()
    assert export["account"]["exam_logo"]["content_b64"] == _b64(PNG)
    (exam,) = [e for e in export["exams"] if e["id"] == exam_id]
    assert exam["logo"]["mode"] == "custom"
    assert exam["logo"]["file"]["content_b64"] == _b64(PDF)
