"""Compile router: background compile jobs (`/compile/latex/jobs`), so no compile meets the proxy timeout."""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import DB, get_teaching_teacher
from app.middleware.rate_limit import limiter
from app.models.teacher import Teacher
from app.schemas.latex import LaTeXRequest
from app.services import compile_jobs
from app.services.capabilities import require_server_latex
from app.services.exercise_resource_store import load_resources_for_exercises
from app.services.latex import CompilationError, compilation_failed_response, compile_latex
from app.services.latex_resources import ResourceError
from app.services.logo import ResolvedLogo, resolve_logo_for_compile

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/compile",
    tags=["compile"],
    dependencies=[Depends(get_teaching_teacher)],
)


def _error(status_code: int, detail: str, code: str) -> JSONResponse:
    # Same shape as an HTTPException (detail in the body, code in a header), but storable as a job outcome.
    return JSONResponse(status_code=status_code, content={"detail": detail}, headers={"code": code})


async def _load_inputs(
    body: LaTeXRequest, teacher: Teacher, db: AsyncSession
) -> tuple[dict[str, bytes], ResolvedLogo | None]:
    """Resource files and logo, read inside the request: a job must never outlive the DB session."""
    binary_files = await load_resources_for_exercises(body.resource_exercise_ids, teacher, db)
    # Inline files win: they are the caller's current, unsaved version of a file whose stored copy may be stale.
    binary_files.update(body.binary_files())
    logo = (
        await resolve_logo_for_compile(teacher.id, body.logo_exam_id, db)
        if body.logo_exam_id is not None or body.account_logo
        else None
    )
    return binary_files, logo


async def _compile(latex: str, files: dict[str, bytes], logo: ResolvedLogo | None) -> Response:
    """The PDF, or the error response the caller sees; LaTeX source is NEVER logged, and a 422 carries the diagnostic as `detail` and the sanitized log as `log`, for this caller only."""
    try:
        pdf_bytes = await compile_latex(latex, preview=False, binary_files=files, logo=logo)
    except ResourceError as exc:
        return _error(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc), "ERR_RESOURCE_INVALID")
    except TimeoutError:
        return _error(status.HTTP_504_GATEWAY_TIMEOUT, "Compilation timed out.", "ERR_COMPILE_TIMEOUT")
    except CompilationError as exc:
        logger.info("LaTeX compilation failed: %s", exc)
        return compilation_failed_response(exc)
    except OSError as exc:
        # A missing tectonic binary, an unreachable worker, a full disk: not the document's fault, so not an opaque 500.
        logger.error("LaTeX compilation is unavailable: %s", exc)
        return _error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "The LaTeX compilation service is unavailable.",
            "ERR_COMPILE_UNAVAILABLE",
        )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="output.pdf"'},
    )


@router.post("/latex/jobs", status_code=status.HTTP_202_ACCEPTED, response_model=None)
@limiter.limit("10/minute")
async def start_compile_job(
    request: Request,  # Required by slowapi for rate limiting
    body: LaTeXRequest,
    teacher: Annotated[Teacher, Depends(require_server_latex)],
    db: DB,
) -> dict[str, str] | JSONResponse:
    """Start a compile (body limit: BODY_LIMIT_COMPILE) and answer at once with its `job_id`; poll `GET /compile/latex/jobs/{job_id}`. Passes get the full COMPILE_TIMEOUT_SECONDS, which no proxy sees."""
    try:
        files, logo = await _load_inputs(body, teacher, db)
    except ResourceError as exc:
        return _error(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc), "ERR_RESOURCE_INVALID")
    job_id = compile_jobs.start(teacher.id, _compile(body.latex, files, logo))
    return {"job_id": job_id}


@router.get("/latex/jobs/{job_id}", response_model=None)
@limiter.limit("120/minute")
async def poll_compile_job(
    request: Request,  # Required by slowapi for rate limiting
    job_id: str,
    teacher: Annotated[Teacher, Depends(require_server_latex)],
) -> Response:
    """202 `{"status": "pending"}` while running, then once the PDF (200) or the compile's error response; answers at once, never long-polls."""
    outcome = compile_jobs.poll(teacher.id, job_id)
    if outcome is None:
        return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content={"status": "pending"})
    return outcome

