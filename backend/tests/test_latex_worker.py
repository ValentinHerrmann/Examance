"""LaTeX worker (S1): the backend hands compiles to the worker container and maps its answers."""
from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path
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


@pytest.mark.asyncio
async def test_pass_timeout_logs_counts_never_document_names(
    caplog: pytest.LogCaptureFixture,
) -> None:
    from app.services import tectonic

    procs: list[AsyncMock] = []

    async def hanging_exec(*_args: object, stderr: object, **_kwargs: object) -> AsyncMock:
        stderr.write(b"note: downloading secret-student-name.tex\nnote: downloading x.sty\n")  # type: ignore[attr-defined]
        stderr.flush()  # type: ignore[attr-defined]
        proc = AsyncMock()
        proc.returncode = None
        proc.kill = lambda: setattr(proc, "returncode", -9)

        async def wait() -> int:
            if proc.returncode is None:
                await asyncio.sleep(10)
            return proc.returncode

        proc.wait = wait
        procs.append(proc)
        return proc

    with patch("asyncio.create_subprocess_exec", side_effect=hanging_exec), \
            caplog.at_level("WARNING"), pytest.raises(TimeoutError):
        await tectonic.run_tectonic("\\documentclass{article}", {}, timeout=0.05)

    assert procs[0].returncode == -9  # killed, never orphaned
    assert "timed out" in caplog.text and "2 bundle downloads" in caplog.text
    assert "secret-student-name" not in caplog.text


@pytest.mark.asyncio
async def test_each_pass_logs_its_duration(caplog: pytest.LogCaptureFixture) -> None:
    from app.services import tectonic

    async def quick_exec(*_args: object, **_kwargs: object) -> AsyncMock:
        proc = AsyncMock()
        proc.returncode = 0
        return proc

    original_mkdtemp = tempfile.mkdtemp

    def fake_mkdtemp(**kwargs: object) -> str:
        d = original_mkdtemp(**kwargs)  # type: ignore[call-overload]
        (Path(d) / "main.pdf").write_bytes(b"%PDF-1.4 fake")
        return str(d)

    with patch("asyncio.create_subprocess_exec", side_effect=quick_exec), \
            patch("tempfile.mkdtemp", side_effect=fake_mkdtemp), caplog.at_level("INFO"):
        await tectonic.run_tectonic("\\documentclass{article} secret-exam-text", {}, timeout=5)

    durations = [r.getMessage() for r in caplog.records if "took" in r.getMessage()]
    assert len(durations) == 2 and durations[0].startswith("Tectonic pass 1 took ")
    assert "secret-exam-text" not in caplog.text
