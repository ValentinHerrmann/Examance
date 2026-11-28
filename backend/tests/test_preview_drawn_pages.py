"""Tests for the drawn-pages preview switch on the account (issue #352)."""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.test_api import _create_teacher_and_login


@pytest.mark.asyncio
async def test_preview_drawn_pages_defaults_on(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "previewfresh@example.com")
    resp = await client.get("/api/v1/user/capabilities")
    assert resp.status_code == 200
    assert resp.json()["preview_drawn_pages"] is True


@pytest.mark.asyncio
async def test_preview_drawn_pages_round_trips(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "previewset@example.com")
    put = await client.put("/api/v1/user/preview-drawn-pages", json={"preview_drawn_pages": False})
    assert put.status_code == 200
    assert put.json()["preview_drawn_pages"] is False
    again = await client.get("/api/v1/user/capabilities")
    assert again.json()["preview_drawn_pages"] is False


@pytest.mark.asyncio
async def test_preview_drawn_pages_rejects_null(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "previewbad@example.com")
    resp = await client.put("/api/v1/user/preview-drawn-pages", json={"preview_drawn_pages": None})
    assert resp.status_code == 422
