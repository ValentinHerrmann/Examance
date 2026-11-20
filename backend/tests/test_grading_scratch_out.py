"""Tests for the scratch-out switch on the account (issue #330)."""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.test_api import _create_teacher_and_login


@pytest.mark.asyncio
async def test_scratch_out_defaults_on(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "scratchfresh@example.com")
    resp = await client.get("/api/v1/user/capabilities")
    assert resp.status_code == 200
    assert resp.json()["grading_scratch_out"] is True


@pytest.mark.asyncio
async def test_scratch_out_round_trips(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "scratchset@example.com")
    put = await client.put("/api/v1/user/grading-scratch-out", json={"grading_scratch_out": False})
    assert put.status_code == 200
    assert put.json()["grading_scratch_out"] is False
    again = await client.get("/api/v1/user/capabilities")
    assert again.json()["grading_scratch_out"] is False


@pytest.mark.asyncio
async def test_scratch_out_rejects_null(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "scratchbad@example.com")
    resp = await client.put("/api/v1/user/grading-scratch-out", json={"grading_scratch_out": None})
    assert resp.status_code == 422
