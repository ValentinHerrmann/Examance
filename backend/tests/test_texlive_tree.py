"""The TeX Live tree for the browser engine is served read-only, to signed-in accounts only (issue #346)."""
from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import texlive_tree
from app.services.texrunner import CONFIG_DIR

from .factors import sign_in


@pytest.fixture
def fake_tree(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    root = tmp_path / "texlive"
    (root / "tlpkg").mkdir(parents=True)
    (root / "tlpkg" / "texlive.tlpdb").write_text("name 00texlive.config\n")
    (root / "texmf.cnf").write_text("% root cnf\n")
    files = {
        "texmf-dist/tex/latex/base/article.cls": "\\ProvidesClass{article}\n",
        "texmf-dist/doc/latex/base/manual.pdf": "skipped",
        "texmf-var/web2c/xetex/xelatex.fmt": "fmt-bytes",
    }
    for rel, text in files.items():
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text(text)
    outside = tmp_path / "secret.txt"
    outside.write_text("not part of the tree")
    (root / "texmf-dist" / "tex" / "escape.txt").symlink_to(outside)
    monkeypatch.setattr(texlive_tree, "TEXLIVE_ROOT", root)
    texlive_tree.tree_manifest.cache_clear()
    yield root
    texlive_tree.tree_manifest.cache_clear()


async def test_tree_requires_authentication(client: AsyncClient, fake_tree: Path) -> None:
    assert (await client.get("/api/v1/texlive/index.json")).status_code == 401
    assert (await client.get("/api/v1/texlive/texmf.cnf")).status_code == 401


async def test_manifest_lists_served_files_only(client: AsyncClient, db: AsyncSession, fake_tree: Path) -> None:
    await sign_in(client, db, "tree@example.com")
    body = (await client.get("/api/v1/texlive/index.json")).json()
    files = body["files"]
    assert files["texmf-dist/tex/latex/base/article.cls"] == len("\\ProvidesClass{article}\n")
    assert "texmf-var/web2c/xetex/xelatex.fmt" in files
    assert texlive_tree.EXAMANCE_CNF in files
    assert "texmf-dist/doc/latex/base/manual.pdf" not in files
    assert "texmf-dist/tex/escape.txt" not in files
    assert len(body["version"]) == 16


async def test_files_match_the_tree_and_revalidate(client: AsyncClient, db: AsyncSession, fake_tree: Path) -> None:
    await sign_in(client, db, "tree-files@example.com")
    resp = await client.get("/api/v1/texlive/texmf-dist/tex/latex/base/article.cls?v=x")
    assert resp.status_code == 200
    assert resp.content == (fake_tree / "texmf-dist/tex/latex/base/article.cls").read_bytes()
    assert "immutable" in resp.headers["cache-control"]
    again = await client.get(
        "/api/v1/texlive/texmf-dist/tex/latex/base/article.cls", headers={"If-None-Match": resp.headers["etag"]}
    )
    assert again.status_code == 304
    cnf = await client.get(f"/api/v1/texlive/{texlive_tree.EXAMANCE_CNF}")
    assert cnf.content == (CONFIG_DIR / "texmf.cnf").read_bytes()


async def test_unlisted_and_traversal_paths_are_404(client: AsyncClient, db: AsyncSession, fake_tree: Path) -> None:
    await sign_in(client, db, "tree-404@example.com")
    for bad in (
        "texmf-dist/doc/latex/base/manual.pdf",
        "texmf-dist/tex/escape.txt",
        "texmf-dist/../tlpkg/texlive.tlpdb",
        "%2e%2e/tlpkg/texlive.tlpdb",
        "/etc/passwd",
        "texmf-dist",
    ):
        assert (await client.get(f"/api/v1/texlive/{bad}")).status_code == 404


async def test_no_tree_answers_503(client: AsyncClient, db: AsyncSession, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(texlive_tree, "TEXLIVE_ROOT", tmp_path / "missing")
    texlive_tree.tree_manifest.cache_clear()
    await sign_in(client, db, "tree-none@example.com")
    resp = await client.get("/api/v1/texlive/index.json")
    assert resp.status_code == 503
    assert resp.headers["code"] == "ERR_TEXLIVE_UNAVAILABLE"
    texlive_tree.tree_manifest.cache_clear()
