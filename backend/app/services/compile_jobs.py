"""Background LaTeX compiles, so no single request outlives the proxy's timeout (Cloudflare cuts at 100 s). In process memory: the backend runs one uvicorn process; with several, polls would miss their job."""
from __future__ import annotations

import asyncio
import secrets
import time
import uuid
from collections.abc import Coroutine
from dataclasses import dataclass, field
from typing import Any

from fastapi import HTTPException, status
from fastapi.responses import Response

MAX_PER_TEACHER = 3
MAX_TOTAL = 20
# A finished PDF waits at most this long for its owner to fetch it.
RESULT_TTL_SECONDS = 120
# Far beyond a slot wait plus two 120 s passes; only a stuck job gets here.
JOB_TTL_SECONDS = 600


@dataclass
class _Job:
    teacher_id: uuid.UUID
    task: asyncio.Task[Response]
    started: float = field(default_factory=time.monotonic)
    finished: float | None = None


_jobs: dict[str, _Job] = {}


def _sweep() -> None:
    now = time.monotonic()
    for job_id, job in list(_jobs.items()):
        if job.finished is None and job.task.done():
            job.finished = now
        too_old = now - job.started > JOB_TTL_SECONDS
        if too_old or (job.finished is not None and now - job.finished > RESULT_TTL_SECONDS):
            job.task.cancel()
            del _jobs[job_id]


def start(teacher_id: uuid.UUID, work: Coroutine[Any, Any, Response]) -> str:
    """Run *work* in the background and return its job id; 429/503 when the caps are reached."""
    _sweep()
    running = [j for j in _jobs.values() if not j.task.done()]
    if sum(j.teacher_id == teacher_id for j in running) >= MAX_PER_TEACHER:
        work.close()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many compilations are already running for this account.",
            headers={"code": "ERR_COMPILE_BUSY"},
        )
    if len(running) >= MAX_TOTAL:
        work.close()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The LaTeX compilation service is busy.",
            headers={"code": "ERR_COMPILE_UNAVAILABLE"},
        )
    job_id = secrets.token_urlsafe(16)
    # The dict holds the task, so it cannot be garbage-collected mid-compile.
    _jobs[job_id] = _Job(teacher_id=teacher_id, task=asyncio.create_task(work))
    return job_id


def poll(teacher_id: uuid.UUID, job_id: str) -> Response | None:
    """None while running; the finished response exactly once. An unknown or foreign id is 404 (no oracle; a restart also loses jobs)."""
    _sweep()
    job = _jobs.get(job_id)
    if job is None or job.teacher_id != teacher_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Compilation job not found.",
            headers={"code": "ERR_COMPILE_JOB_UNKNOWN"},
        )
    if not job.task.done():
        return None
    del _jobs[job_id]
    return job.task.result()
