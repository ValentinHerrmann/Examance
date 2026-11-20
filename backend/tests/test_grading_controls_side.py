"""Tests for the grading controls side on the account (issue #328)."""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.test_api import _create_teacher_and_login


@pytest.mark.asyncio
async def test_controls_side_defaults_left(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "sidefresh@example.com")
    resp = await client.get("/api/v1/user/capabilities")
    assert resp.status_code == 200
    assert resp.json()["grading_controls_side"] == "left"


@pytest.mark.asyncio
async def test_controls_side_round_trips(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "sideset@example.com")
    put = await client.put(
        "/api/v1/user/grading-controls-side", json={"grading_controls_side": "right"}
    )
    assert put.status_code == 200
    assert put.json()["grading_controls_side"] == "right"
    again = await client.get("/api/v1/user/capabilities")
    assert again.json()["grading_controls_side"] == "right"


@pytest.mark.asyncio
async def test_controls_side_rejects_unknown(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "sidebad@example.com")
    resp = await client.put(
        "/api/v1/user/grading-controls-side", json={"grading_controls_side": "top"}
    )
    assert resp.status_code == 422
