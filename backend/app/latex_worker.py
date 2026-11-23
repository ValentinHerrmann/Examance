"""LaTeX worker: runs Tectonic in its own container without secrets, database or scan files. Reached only by the backend (`LATEX_WORKER_URL`); never import app.config here."""
from __future__ import annotations

import base64
import logging

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.services.tectonic import COMPILE_TIMEOUT_SECONDS, CompilationError, run_tectonic

# Same format as the backend; without it only warnings reach the container log.
logging.basicConfig(level=logging.INFO, format="%(levelname)s:\t%(name)s - %(message)s")

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


class CompileJob(BaseModel):
    main_tex: str
    files: dict[str, str] = {}  # relative path -> base64
    seed_aux: dict[str, str] = {}  # AUX_FILE_NAMES entry -> base64
    timeout: float = Field(gt=0, le=COMPILE_TIMEOUT_SECONDS)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/compile")
async def compile_job(job: CompileJob) -> JSONResponse:
    try:
        files = {path: base64.b64decode(blob, validate=True) for path, blob in job.files.items()}
        seed_aux = {name: base64.b64decode(blob, validate=True) for name, blob in job.seed_aux.items()}
    except ValueError:  # binascii.Error is a ValueError
        return JSONResponse(status_code=400, content={"detail": "Invalid file encoding."})
    try:
        result = await run_tectonic(job.main_tex, files, job.timeout, seed_aux)
    except TimeoutError:
        return JSONResponse(status_code=504, content={"detail": "Compilation timed out."})
    except CompilationError as exc:
        # Only the backend reads this; it hands diagnostic and sanitized log to the requesting teacher alone (issue #166, docs/data_flow_and_security.md).
        return JSONResponse(status_code=422, content={"detail": str(exc), "log": exc.log})
    except OSError:
        return JSONResponse(status_code=503, content={"detail": "Tectonic is unavailable."})
    return JSONResponse(content={
        "pdf_b64": base64.b64encode(result.pdf).decode("ascii"),
        "aux": {name: base64.b64encode(blob).decode("ascii") for name, blob in result.aux.items()},
    })
