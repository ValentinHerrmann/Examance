"""LaTeX worker (S1): the backend hands compiles to the worker container and maps its answers."""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app import latex_worker
from app.config import settings
from app.services import latex
from app.services.tectonic import CompilationError


@pytest.fixture
def worker(monkeypatch: pytest.MonkeyPatch) -> None:
    """Route the backend's worker calls into the worker app in-process."""
    real_client = httpx.AsyncClient

    def client(**kwargs: object) -> httpx.AsyncClient:
        return real_client(transport=httpx.ASGITransport(app=latex_worker.app), **kwargs)

    monkeypatch.setattr(settings, "LATEX_WORKER_URL", "http://latex:8001")
    monkeypatch.setattr(latex.httpx, "AsyncClient", client)


@pytest.mark.asyncio
async def test_worker_returns_the_pdf_and_receives_resources(worker: None) -> None:
    run = AsyncMock(return_value=b"%PDF-1.7 worker")
    with patch.object(latex_worker, "run_tectonic", run):
        pdf = await latex.compile_latex("Hello", binary_files={"img.png": b"\x89PNG"})
    assert pdf == b"%PDF-1.7 worker"
    main_tex, files, _timeout = run.call_args.args
    assert "\\documentclass" in main_tex
    assert files == {"img.png": b"\x89PNG"}


@pytest.mark.asyncio
async def test_worker_errors_map_back(worker: None) -> None:
    failing = AsyncMock(side_effect=CompilationError("! Boom", log="full log"))
    with patch.object(latex_worker, "run_tectonic", failing), pytest.raises(CompilationError) as exc:
        await latex.compile_latex("\\documentclass{article}")
    assert str(exc.value) == "! Boom"
    assert exc.value.log == "full log"

    with patch.object(latex_worker, "run_tectonic", AsyncMock(side_effect=TimeoutError)), \
            pytest.raises(TimeoutError):
        await latex.compile_latex("\\documentclass{article}")

    with patch.object(latex_worker, "run_tectonic", AsyncMock(side_effect=OSError)), \
            pytest.raises(OSError):
        await latex.compile_latex("\\documentclass{article}")


@pytest.mark.asyncio
async def test_unreachable_worker_is_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "LATEX_WORKER_URL", "http://127.0.0.1:9")
    with pytest.raises(OSError):
        await latex.compile_latex("\\documentclass{article}")


@pytest.mark.asyncio
async def test_worker_rejects_paths_outside_its_workdir() -> None:
    transport = httpx.ASGITransport(app=latex_worker.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://latex") as client:
        res = await client.post(
            "/compile",
            json={"main_tex": "x", "files": {"../escape.tex": "eA=="}, "timeout": 5},
        )
    assert res.status_code == 422
    assert "Invalid extra file path" in res.json()["detail"]
