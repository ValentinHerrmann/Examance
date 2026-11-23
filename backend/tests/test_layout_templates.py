"""Tests for the account's layout templates (issue #279)."""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from .factors import sign_in, unique_email

pytestmark = pytest.mark.asyncio

URL = "/api/v1/user/layout-templates"


async def test_defaults_are_empty(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, unique_email("layout-fresh"))
    resp = await client.get(URL)
    assert resp.status_code == 200
    assert resp.json() == {"templates": []}


async def test_round_trip_and_reset(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, unique_email("layout-set"))
    body = {"templates": [{"id": "paperClassic", "title": " Class test ", "text": "", "fields": {"printLayout": "booklet", "infoText": "60 min"}}]}
    put = await client.put(URL, json=body)
    assert put.status_code == 200
    saved = put.json()["templates"][0]
    assert saved == {"id": "paperClassic", "title": "Class test", "text": None, "fields": {"printLayout": "booklet", "infoText": "60 min"}}
    assert (await client.get(URL)).json()["templates"] == [saved]
    reset = await client.put(URL, json={"templates": []})
    assert reset.json() == {"templates": []}


@pytest.mark.parametrize(
    "templates",
    [
        [{"id": "fullDigital"}],
        [{"id": "paperClassic"}, {"id": "paperClassic"}],
        [{"id": "paperClassic", "fields": {"infoText": "x" * 20_000}}],
        [{"id": "paperClassic", "title": "x" * 81}],
    ],
)
async def test_rejects_invalid(client: AsyncClient, db: AsyncSession, templates: list[dict[str, object]]) -> None:
    await sign_in(client, db, unique_email("layout-bad"))
    assert (await client.put(URL, json={"templates": templates})).status_code == 422


async def test_admin_is_refused(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, unique_email("layout-admin"), role="admin")
    resp = await client.get(URL)
    assert resp.status_code == 403
    assert resp.headers.get("code") == "ERR_TEACHER_ROLE_REQUIRED"
