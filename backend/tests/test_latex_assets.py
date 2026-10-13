"""Bundled LaTeX assets are served to signed-in accounts only (issue #87)."""
from __future__ import annotations

import hashlib

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.latex import ASSETS_DIR

from .factors import sign_in


async def test_assets_require_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/latex-assets/index.json")).status_code == 401
    assert (await client.get("/api/v1/latex-assets/sty/Schulaufgabe.sty")).status_code == 401


async def test_index_matches_served_files(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "assets@example.com")
    files = (await client.get("/api/v1/latex-assets/index.json")).json()["files"]
    assert any(f["path"] == "sty/Schulaufgabe.sty" for f in files)
    for f in files:
        resp = await client.get(f"/api/v1/latex-assets/{f['path']}")
        assert resp.status_code == 200
        assert hashlib.sha256(resp.content).hexdigest() == f["sha256"]
        assert resp.content == (ASSETS_DIR / f["path"]).read_bytes()
        assert resp.headers["cache-control"] == "private, no-cache"
        assert (
            await client.get(
                f"/api/v1/latex-assets/{f['path']}", headers={"If-None-Match": resp.headers["etag"]}
            )
        ).status_code == 304


async def test_unlisted_and_traversal_paths_are_404(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "assets-404@example.com")
    for bad in ("nope.sty", "sty/../../app/main.py", "%2e%2e/app/main.py", "/etc/passwd", "sty"):
        assert (await client.get(f"/api/v1/latex-assets/{bad}")).status_code == 404
