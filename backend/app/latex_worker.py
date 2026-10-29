"""LaTeX worker: runs Tectonic in its own container without secrets, database or scan files. Reached only by the backend (`LATEX_WORKER_URL`); never import app.config here."""
from __future__ import annotations

import base64
import binascii

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from app.services.tectonic import COMPILE_TIMEOUT_SECONDS, CompilationError, run_tectonic

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


class CompileJob(BaseModel):
    main_tex: str
    files: dict[str, str] = {}  # relative path -> base64
    timeout: float = Field(gt=0, le=COMPILE_TIMEOUT_SECONDS)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/compile")
async def compile_job(job: CompileJob) -> Response:
    try:
        files = {path: base64.b64decode(blob, validate=True) for path, blob in job.files.items()}
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid file encoding.") from exc
    try:
        pdf = await run_tectonic(job.main_tex, files, job.timeout)
    except TimeoutError:
        return JSONResponse(status_code=504, content={"detail": "Compilation timed out."})
    except CompilationError as exc:
        return JSONResponse(status_code=422, content={"detail": str(exc), "log": exc.log})
    except OSError:
        return JSONResponse(status_code=503, content={"detail": "Tectonic is unavailable."})
    return Response(content=pdf, media_type="application/pdf")
