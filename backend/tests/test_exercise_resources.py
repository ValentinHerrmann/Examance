"""Exercise resource files: CRUD, compile integration, and error surfacing."""
from __future__ import annotations

import base64
import uuid
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.middleware.cors import is_allowed_origin

from .factors import sign_in

PNG = b"\x89PNG\r\n\x1a\n" + b"pretend-image-bytes"
PNG_B64 = base64.b64encode(PNG).decode()


async def _login(client: AsyncClient, db: AsyncSession, email: str) -> None:
    # Two factors, because one no longer produces a session. See tests/factors.py.
    await sign_in(client, db, email)


async def _create_exercise(client: AsyncClient, name: str = "With figure") -> str:
    resp = await client.post(
        "/api/v1/exercises",
        json={"name": name, "latex_body": "\\includegraphics{figure.png}", "max_points": 5},
    )
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


@pytest.mark.asyncio
async def test_resource_crud_roundtrip(client: AsyncClient, db: AsyncSession) -> None:
    await _login(client, db, "res-crud@example.com")
    exercise_id = await _create_exercise(client)

    created = await client.post(
        f"/api/v1/exercises/{exercise_id}/resources",
        json={"filename": "my figure.png", "mime_type": "image/png", "content_b64": PNG_B64},
    )
    assert created.status_code == 201, created.text
    body = created.json()
    # The name is sanitised server-side; the client must use what it gets back.
    assert body["filename"] == "my_figure.png"
    assert body["byte_size"] == len(PNG)
    resource_id = body["id"]

    listed = await client.get(f"/api/v1/exercises/{exercise_id}/resources")
    assert [r["filename"] for r in listed.json()] == ["my_figure.png"]

    download = await client.get(f"/api/v1/exercises/{exercise_id}/resources/{resource_id}")
    assert download.status_code == 200
    assert download.content == PNG
    assert download.headers["content-type"].startswith("image/png")
    assert download.headers["x-content-type-options"] == "nosniff"

    renamed = await client.patch(
        f"/api/v1/exercises/{exercise_id}/resources/{resource_id}",
        json={"filename": "plot.png"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["filename"] == "plot.png"

    deleted = await client.delete(f"/api/v1/exercises/{exercise_id}/resources/{resource_id}")
    assert deleted.status_code == 204
    assert await (await client.get(f"/api/v1/exercises/{exercise_id}/resources")).aread() == b"[]"


@pytest.mark.asyncio
async def test_reupload_same_name_replaces_instead_of_conflicting(
    client: AsyncClient, db: AsyncSession
) -> None:
    """A corrected figure is re-uploaded under the same name — that must not 409."""
    await _login(client, db, "res-replace@example.com")
    exercise_id = await _create_exercise(client)

    first = await client.post(
        f"/api/v1/exercises/{exercise_id}/resources",
        json={"filename": "figure.png", "content_b64": PNG_B64},
    )
    assert first.status_code == 201

    bigger = base64.b64encode(PNG + b"more").decode()
    second = await client.post(
        f"/api/v1/exercises/{exercise_id}/resources",
        json={"filename": "figure.png", "content_b64": bigger},
    )
    assert second.status_code == 201, second.text
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["byte_size"] == len(PNG) + 4

    listed = await client.get(f"/api/v1/exercises/{exercise_id}/resources")
    assert len(listed.json()) == 1


@pytest.mark.asyncio
async def test_svg_is_refused_with_a_conversion_hint(
    client: AsyncClient, db: AsyncSession
) -> None:
    await _login(client, db, "res-svg@example.com")
    exercise_id = await _create_exercise(client)

    resp = await client.post(
        f"/api/v1/exercises/{exercise_id}/resources",
        json={"filename": "diagram.svg", "content_b64": PNG_B64},
    )
    assert resp.status_code == 422
    assert "PDF" in resp.text


@pytest.mark.asyncio
async def test_upload_to_unknown_exercise_is_404(client: AsyncClient, db: AsyncSession) -> None:
    await _login(client, db, "res-404@example.com")
    resp = await client.post(
        f"/api/v1/exercises/{uuid.uuid4()}/resources",
        json={"filename": "figure.png", "content_b64": PNG_B64},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_compile_loads_resources_by_exercise_id(
    client: AsyncClient, db: AsyncSession
) -> None:
    """Server/hybrid clients name their exercises; the bytes never leave the server."""
    await _login(client, db, "res-compile@example.com")
    exercise_id = await _create_exercise(client)
    await client.post(
        f"/api/v1/exercises/{exercise_id}/resources",
        json={"filename": "figure.png", "content_b64": PNG_B64},
    )

    seen: dict[str, bytes] = {}

    async def fake_compile(latex, extra_files=None, preview=True, binary_files=None):
        seen.update(binary_files or {})
        return b"%PDF-1.4 fake"

    with patch("app.routers.compile.compile_latex", side_effect=fake_compile):
        resp = await client.post(
            "/api/v1/compile/latex",
            json={
                "latex": "\\documentclass{article}",
                "resource_exercise_ids": [exercise_id],
            },
        )
    assert resp.status_code == 200, resp.text
    assert seen == {"figure.png": PNG}


@pytest.mark.asyncio
async def test_compile_ignores_another_teachers_exercise_ids(
    client: AsyncClient, db: AsyncSession
) -> None:
    await _login(client, db, "res-owner@example.com")
    foreign_id = await _create_exercise(client, name="Not yours")
    await client.post(
        f"/api/v1/exercises/{foreign_id}/resources",
        json={"filename": "secret.png", "content_b64": PNG_B64},
    )

    client.cookies.clear()
    await _login(client, db, "res-intruder@example.com")

    seen: dict[str, bytes] = {}

    async def fake_compile(latex, extra_files=None, preview=True, binary_files=None):
        seen.update(binary_files or {})
        return b"%PDF-1.4 fake"

    with patch("app.routers.compile.compile_latex", side_effect=fake_compile):
        resp = await client.post(
            "/api/v1/compile/latex",
            json={"latex": "\\documentclass{article}", "resource_exercise_ids": [foreign_id]},
        )
    assert resp.status_code == 200
    assert seen == {}


@pytest.mark.asyncio
async def test_inline_resource_overrides_the_stored_copy(
    client: AsyncClient, db: AsyncSession
) -> None:
    """An unsaved edit in the browser must win over the stored file."""
    await _login(client, db, "res-inline@example.com")
    exercise_id = await _create_exercise(client)
    await client.post(
        f"/api/v1/exercises/{exercise_id}/resources",
        json={"filename": "figure.png", "content_b64": PNG_B64},
    )

    seen: dict[str, bytes] = {}

    async def fake_compile(latex, extra_files=None, preview=True, binary_files=None):
        seen.update(binary_files or {})
        return b"%PDF-1.4 fake"

    newer = b"\x89PNG\r\n\x1a\nnewer-bytes"
    with patch("app.routers.compile.compile_latex", side_effect=fake_compile):
        resp = await client.post(
            "/api/v1/compile/latex",
            json={
                "latex": "\\documentclass{article}",
                "resource_exercise_ids": [exercise_id],
                "resources": [
                    {"filename": "figure.png", "content_b64": base64.b64encode(newer).decode()}
                ],
            },
        )
    assert resp.status_code == 200
    assert seen == {"figure.png": newer}


@pytest.mark.asyncio
async def test_engine_unavailable_is_503_not_500(client: AsyncClient, db: AsyncSession) -> None:
    """A missing tectonic binary must not surface as an opaque 500."""
    await _login(client, db, "res-engine@example.com")

    with patch(
        "app.routers.compile.compile_latex",
        side_effect=FileNotFoundError("tectonic"),
    ):
        resp = await client.post(
            "/api/v1/compile/latex", json={"latex": "\\documentclass{article}"}
        )
    assert resp.status_code == 503
    assert resp.headers.get("code") == "ERR_COMPILE_UNAVAILABLE"


@pytest.mark.asyncio
async def test_unhandled_error_still_carries_cors_headers(
    client: AsyncClient, db: AsyncSession
) -> None:
    """
    A 500 is produced outside CORSMiddleware. Without headers of its own the
    browser reports it as a CORS failure and the real fault stays invisible.

    The shared client re-raises application exceptions, so this one lets the
    stack turn them into a response, the way uvicorn does in production.
    """
    await _login(client, db, "res-cors@example.com")
    origin = "http://localhost:5173"

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="https://test") as serving:
        serving.cookies.update(client.cookies)
        with patch("app.routers.compile.compile_latex", side_effect=RuntimeError("boom")):
            resp = await serving.post(
                "/api/v1/compile/latex",
                json={"latex": "\\documentclass{article}"},
                headers={"Origin": origin},
            )

    assert resp.status_code == 500
    assert resp.headers.get("access-control-allow-origin") == origin
    assert resp.headers.get("access-control-allow-credentials") == "true"
    assert resp.json()["code"] == "ERR_INTERNAL"


@pytest.mark.asyncio
async def test_unlisted_origin_never_reaches_the_handler(
    client: AsyncClient, db: AsyncSession
) -> None:
    """The origin guard rejects it first, and the 500 handler would not echo it."""
    await _login(client, db, "res-cors-evil@example.com")

    resp = await client.post(
        "/api/v1/compile/latex",
        json={"latex": "\\documentclass{article}"},
        headers={"Origin": "https://attacker.example"},
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "ERR_ORIGIN_REJECTED"
    assert not is_allowed_origin("https://attacker.example")
