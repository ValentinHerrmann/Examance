"""LaTeX compilation: validates the request, then runs Tectonic in the worker or here."""
from __future__ import annotations

import base64
import ctypes
import logging
import re
import sys

import httpx
from fastapi.responses import JSONResponse

from app.config import settings
from app.services.latex_packages import PackageLayer, document_body, exercise_entries, with_packages
from app.services.latex_resources import validate_resource_name
from app.services.logo import ResolvedLogo
from app.services.tectonic import (
    COMPILE_TIMEOUT_SECONDS,
    PREVIEW_TIMEOUT_SECONDS,
    CompilationError,
    run_tectonic,
)

__all__ = ["CompilationError", "compilation_failed_response", "compile_latex"]

logger = logging.getLogger(__name__)

_PR_SET_DUMPABLE = 4

# A tripwire for the obvious ways a document asks for a file outside its directory, not the boundary (that is the worker container): TeX can build paths in many ways.
_ABSOLUTE_OR_PARENT_PATH = re.compile(
    r"\\(?:input|include|InputIfFileExists|openin|openout|write|read|usepackage|RequirePackage"
    r"|lstinputlisting|includegraphics|import|subimport|verbatiminput)"
    r"\s*(?:\[[^\]]*\])?\s*\{?\s*(?:/|\.\./|~|\\\\)",
)


def forbid_environ_reads() -> None:
    """Make this process's /proc/<pid>/environ and memory unreadable to its same-user children. Linux only, called once at startup; matters when Tectonic runs here instead of the worker."""
    if not sys.platform.startswith("linux"):
        return
    try:
        libc = ctypes.CDLL(None, use_errno=True)
        if libc.prctl(_PR_SET_DUMPABLE, 0, 0, 0, 0) != 0:
            raise OSError(ctypes.get_errno(), "prctl(PR_SET_DUMPABLE, 0) failed")
    except (OSError, AttributeError) as exc:
        logger.warning("Could not hide the server environment from LaTeX compiles: %s", exc)


def compilation_failed_response(exc: CompilationError) -> JSONResponse:
    """422 ``ERR_COMPILE_FAILED``: the TeX diagnostic as ``detail``, the full log as ``log``."""
    return JSONResponse(
        status_code=422,
        content={"detail": str(exc), "code": "ERR_COMPILE_FAILED", "log": exc.log},
        headers={"code": "ERR_COMPILE_FAILED"},
    )


def reject_unsafe_paths(latex_source: str) -> None:
    """Raise CompilationError if *latex_source* references an absolute or parent path (fails fast with a clear message on the common cases)."""
    if _ABSOLUTE_OR_PARENT_PATH.search(latex_source):
        raise CompilationError("Absolute and parent-directory file references are not permitted.")


def _with_body_packages(doc: str) -> str:
    return with_packages(doc, [PackageLayer("exercise", exercise_entries(document_body(doc)))])


async def _run_in_worker(main_tex: str, files: dict[str, bytes], timeout: float) -> bytes:
    """POST the job to the LaTeX worker and map its answer back onto the local runner's errors."""
    job = {
        "main_tex": main_tex,
        "files": {path: base64.b64encode(blob).decode() for path, blob in files.items()},
        "timeout": timeout,
    }
    try:
        # Slot wait plus two passes, with headroom for transfer.
        async with httpx.AsyncClient(timeout=3 * timeout + 10) as client:
            res = await client.post(f"{settings.LATEX_WORKER_URL.rstrip('/')}/compile", json=job)
    except httpx.TimeoutException:
        raise TimeoutError from None
    except httpx.HTTPError as exc:
        raise OSError(f"LaTeX worker unreachable: {exc}") from exc
    if res.status_code == 200:
        return res.content
    if res.status_code == 422:
        body = res.json()
        raise CompilationError(str(body.get("detail", "")), log=body.get("log"))
    if res.status_code == 504:
        raise TimeoutError
    raise OSError(f"LaTeX worker answered {res.status_code}")


async def compile_latex(
    latex_source: str,
    preview: bool = True,
    binary_files: dict[str, bytes] | None = None,
    logo: ResolvedLogo | None = None,
) -> bytes:
    """Compile *latex_source* and return raw PDF bytes. *binary_files* are teacher resources by flat name, validated so they cannot escape the workdir or shadow a .sty; *logo* is the logo."""
    reject_unsafe_paths(latex_source)
    if "\\documentclass" not in latex_source:
        latex_source = _with_body_packages(f"""\\documentclass[a4paper]{{article}}
\\usepackage[sans,punkte]{{sty/Schulaufgabe}}
\\usetikzlibrary{{shapes.geometric, arrows}}
\\usepackage{{sty/tikz-uml}}
\\neverindent
\\WarningsOff
\\begin{{document}}
{latex_source}
\\end{{document}}
""")
    files = {validate_resource_name(name): blob for name, blob in (binary_files or {}).items()}
    if logo is not None:
        files[logo.filename] = logo.content
    timeout = PREVIEW_TIMEOUT_SECONDS if preview else COMPILE_TIMEOUT_SECONDS
    # Document content is NEVER logged (see schemas/latex.py). Sizes only.
    logger.debug(
        "Starting LaTeX compilation (preview=%s, main.tex=%d chars, files=%d/%d bytes)",
        preview, len(latex_source), len(files), sum(len(b) for b in files.values()),
    )
    if settings.LATEX_WORKER_URL:
        return await _run_in_worker(latex_source, files, timeout)
    return await run_tectonic(latex_source, files, timeout)
