"""Tests for /api/v1/user/capabilities and /api/v1/user/storage-mode (issue #47)."""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.test_api import _create_teacher_and_login


@pytest.mark.asyncio
async def test_storage_mode_starts_unchosen(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "modefresh@example.com")
    resp = await client.get("/api/v1/user/capabilities")
    assert resp.status_code == 200
    body = resp.json()
    # No default: the teacher chooses explicitly.
    assert body["storage_mode"] is None
    assert set(body["allowed_storage_modes"]) == {"all-server", "hybrid"}
    assert "server_latex" in body["features"]


@pytest.mark.asyncio
async def test_first_choice_and_compare_and_set(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "modecas@example.com")

    first = await client.put("/api/v1/user/storage-mode", json={"mode": "hybrid", "expected": None})
    assert first.status_code == 200
    assert first.json()["storage_mode"] == "hybrid"

    # A second browser still believing "not chosen" must not overwrite the choice.
    stale = await client.put(
        "/api/v1/user/storage-mode", json={"mode": "all-server", "expected": None}
    )
    assert stale.status_code == 409
    assert stale.headers.get("code") == "ERR_STORAGE_MODE_CHANGED"

    switch = await client.put(
        "/api/v1/user/storage-mode", json={"mode": "all-server", "expected": "hybrid"}
    )
    assert switch.status_code == 200
    assert switch.json()["storage_mode"] == "all-server"


@pytest.mark.asyncio
async def test_unknown_mode_rejected(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "modebad@example.com")
    resp = await client.put(
        "/api/v1/user/storage-mode", json={"mode": "all-local", "expected": None}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_disallowed_mode_forbidden(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.routers import user as user_router
    from app.services.capabilities import Capabilities

    monkeypatch.setattr(
        user_router,
        "capabilities_for",
        lambda _t: Capabilities(allowed_storage_modes=("all-server",)),
    )
    await _create_teacher_and_login(client, db, "modeforbidden@example.com")
    resp = await client.put("/api/v1/user/storage-mode", json={"mode": "hybrid", "expected": None})
    assert resp.status_code == 403
    assert resp.headers.get("code") == "ERR_STORAGE_MODE_NOT_ALLOWED"


@pytest.mark.asyncio
async def test_patch_with_empty_latex_keeps_points(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "codeless@example.com")
    created = await client.post(
        "/api/v1/exercises",
        json={"name": "Imported", "latex_body": None, "code_withheld": True, "max_points": 7.0},
    )
    assert created.status_code == 201
    ex = created.json()
    assert ex["latex_body"] is None
    assert ex["code_withheld"] is True
    assert ex["max_points"] == 7.0

    patched = await client.patch(
        f"/api/v1/exercises/{ex['id']}", json={"latex_body": "", "max_points": 7.0}
    )
    assert patched.status_code == 200
    assert patched.json()["max_points"] == 7.0
