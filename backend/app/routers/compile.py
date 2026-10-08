"""Compile router — POST /api/v1/compile/latex"""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_teaching_teacher
from app.middleware.rate_limit import limiter
from app.models.teacher import Teacher
from app.schemas.latex import LaTeXRequest
from app.services.capabilities import require_server_latex
from app.services.exercise_resource_store import load_resources_for_exercises
from app.services.latex import CompilationError, compile_latex
from app.services.latex_resources import ResourceError
from app.services.logo import resolve_logo_for_compile

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/compile",
    tags=["compile"],
    dependencies=[Depends(get_teaching_teacher)],
)


@router.post("/latex")
@limiter.limit("10/minute")
async def compile_latex_endpoint(
    request: Request,  # Required by slowapi for rate limiting
    body: LaTeXRequest,
    teacher: Annotated[Teacher, Depends(require_server_latex)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Compile LaTeX source to PDF via Tectonic (body limit: BODY_LIMIT_COMPILE).

    Extra files come from `resource_exercise_ids` (stored on the server) and `resources` (unsaved
    or local-only exercises). LaTeX source is NEVER logged; 422 detail is TeX diagnostics only."""
    try:
        binary_files = await load_resources_for_exercises(
            body.resource_exercise_ids, teacher, db
        )
        # Inline files win: they are the caller's current, unsaved version of a
        # file whose stored copy may be stale.
        binary_files.update(body.binary_files())
        logo = (
            await resolve_logo_for_compile(teacher.id, body.logo_exam_id, db)
            if body.logo_exam_id is not None or body.account_logo
            else None
        )

        pdf_bytes = await compile_latex(
            body.latex, preview=True, binary_files=binary_files, logo=logo
        )
    except ResourceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
            headers={"code": "ERR_RESOURCE_INVALID"},
        ) from exc
    except TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Compilation timed out.",
            headers={"code": "ERR_COMPILE_TIMEOUT"},
        ) from None
    except CompilationError as exc:
        logger.info("LaTeX preview compilation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
            headers={"code": "ERR_COMPILE_FAILED"},
        ) from exc
    except OSError as exc:
        # A missing tectonic binary, a full disk, an unwritable temp dir. Not
        # the document's fault, and not something the caller can fix by editing
        # it — say so instead of letting it surface as an opaque 500.
        logger.error("LaTeX compilation is unavailable: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The LaTeX compilation service is unavailable.",
            headers={"code": "ERR_COMPILE_UNAVAILABLE"},
        ) from exc

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="output.pdf"'},
    )
