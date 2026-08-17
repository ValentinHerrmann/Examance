"""Health endpoint — the frontend's version-compatibility probe."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.config import settings


@pytest.mark.asyncio
async def test_health_reports_status_and_version(client: AsyncClient) -> None:
    response = await client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"] == settings.APP_VERSION


@pytest.mark.asyncio
async def test_health_needs_no_authentication(client: AsyncClient) -> None:
    """The frontend probes this before any login, so it must stay public."""
    client.cookies.clear()

    response = await client.get("/api/health")

    assert response.status_code == 200
