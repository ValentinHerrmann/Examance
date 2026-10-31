"""Background compile jobs: the browser polls short requests, so no compile meets the proxy's timeout."""
from __future__ import annotations

import asyncio
import time
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import compile_jobs
from app.services.latex import CompilationError

from .factors import sign_in

DOC = {"latex": "\\documentclass{article}"}


async def _wait(client: AsyncClient, job_id: str):  # type: ignore[no-untyped-def]
    for _ in range(100):
        res = await client.get(f"/api/v1/compile/latex/jobs/{job_id}")
        if res.status_code != 202:
            return res
        await asyncio.sleep(0.01)
    raise AssertionError("job never finished")


@pytest.mark.asyncio
async def test_job_runs_with_the_full_budget_and_hands_out_the_pdf_once(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, "jobs-pdf@example.com")
    gate = asyncio.Event()
    seen: list[bool] = []

    async def fake_compile(latex, preview=True, binary_files=None, logo=None):  # type: ignore[no-untyped-def]
        seen.append(preview)
        await gate.wait()
        return b"%PDF-1.4 job"

    with patch("app.routers.compile.compile_latex", side_effect=fake_compile):
        start = await client.post("/api/v1/compile/latex/jobs", json=DOC)
        assert start.status_code == 202
        job_id = start.json()["job_id"]
        pending = await client.get(f"/api/v1/compile/latex/jobs/{job_id}")
        assert pending.status_code == 202 and pending.json() == {"status": "pending"}
        gate.set()
        done = await _wait(client, job_id)

    assert done.status_code == 200 and done.content == b"%PDF-1.4 job"
    assert seen == [False]  # final budget, not the 30 s preview one
    gone = await client.get(f"/api/v1/compile/latex/jobs/{job_id}")
    assert gone.status_code == 404 and gone.headers["code"] == "ERR_COMPILE_JOB_UNKNOWN"


@pytest.mark.asyncio
async def test_job_errors_keep_their_shape(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "jobs-errors@example.com")
    cases = [
        (CompilationError("! Boom", log="full log"), 422, "ERR_COMPILE_FAILED"),
        (TimeoutError(), 504, "ERR_COMPILE_TIMEOUT"),
        (OSError("worker down"), 503, "ERR_COMPILE_UNAVAILABLE"),
    ]
    for error, status_code, code in cases:
        with patch("app.routers.compile.compile_latex", side_effect=error):
            job_id = (await client.post("/api/v1/compile/latex/jobs", json=DOC)).json()["job_id"]
            res = await _wait(client, job_id)
        assert res.status_code == status_code and res.headers["code"] == code
    with patch("app.routers.compile.compile_latex", side_effect=cases[0][0]):
        job_id = (await client.post("/api/v1/compile/latex/jobs", json=DOC)).json()["job_id"]
        body = (await _wait(client, job_id)).json()
    assert body["detail"] == "! Boom" and body["log"] == "full log"


@pytest.mark.asyncio
async def test_jobs_are_private_and_capped(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "jobs-owner@example.com")
    gate = asyncio.Event()

    async def slow(latex, preview=True, binary_files=None, logo=None):  # type: ignore[no-untyped-def]
        await gate.wait()
        return b"%PDF"

    with patch("app.routers.compile.compile_latex", side_effect=slow):
        ids = [
            (await client.post("/api/v1/compile/latex/jobs", json=DOC)).json()["job_id"]
            for _ in range(compile_jobs.MAX_PER_TEACHER)
        ]
        busy = await client.post("/api/v1/compile/latex/jobs", json=DOC)
        assert busy.status_code == 429 and busy.headers["code"] == "ERR_COMPILE_BUSY"

        client.cookies.clear()
        await sign_in(client, db, "jobs-intruder@example.com")
        foreign = await client.get(f"/api/v1/compile/latex/jobs/{ids[0]}")
        assert foreign.status_code == 404
        gate.set()
        await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_unfetched_results_expire(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "jobs-expiry@example.com")

    async def quick(latex, preview=True, binary_files=None, logo=None):  # type: ignore[no-untyped-def]
        return b"%PDF"

    with patch("app.routers.compile.compile_latex", side_effect=quick):
        job_id = (await client.post("/api/v1/compile/latex/jobs", json=DOC)).json()["job_id"]
        await asyncio.sleep(0.01)
    later = time.monotonic() + compile_jobs.RESULT_TTL_SECONDS + 1
    with patch.object(compile_jobs.time, "monotonic", return_value=later):
        compile_jobs._sweep()  # marks the job finished "now"
    with patch.object(compile_jobs.time, "monotonic", return_value=later + compile_jobs.RESULT_TTL_SECONDS + 1):
        res = await client.get(f"/api/v1/compile/latex/jobs/{job_id}")
    assert res.status_code == 404
