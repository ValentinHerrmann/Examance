"""Tectonic runner shared by the backend and the LaTeX worker (`app/latex_worker.py`). Imports nothing that loads settings or secrets: the worker container runs it without either."""
from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import shutil
import tempfile
import time
from collections.abc import AsyncIterator
from pathlib import Path

logger = logging.getLogger(__name__)

PREVIEW_TIMEOUT_SECONDS = 30
COMPILE_TIMEOUT_SECONDS = 120

# Tectonic reads absolute and `../` paths whatever `--untrusted` says (its FilesystemIo allows them), so secrets stay out of the child's environment; in production it runs in the worker.
_CHILD_ENV_KEYS = (
    "PATH", "HOME", "LANG", "LC_ALL", "TZ", "XDG_CACHE_HOME", "TECTONIC_CACHE_DIR",
    "SSL_CERT_FILE", "SSL_CERT_DIR", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
    "http_proxy", "https_proxy", "no_proxy",
)

ASSETS_DIR = Path(__file__).resolve().parents[2] / "latex-assets"
if not ASSETS_DIR.exists():
    ASSETS_DIR = Path("latex-assets")

_MAX_ERROR_LINES = 5
_MAX_ERROR_LINE_CHARS = 200
_MAX_LOG_CHARS = 256 * 1024


class CompilationError(Exception):
    """Raised when Tectonic exits non-zero or the process fails. *log* is the sanitized TeX log (``_read_tex_log``), returned only to the requesting teacher and never logged (issue #166)."""

    def __init__(self, message: str, log: str | None = None) -> None:
        super().__init__(message)
        self.log = log


def _child_env() -> dict[str, str]:
    return {key: value for key in _CHILD_ENV_KEYS if (value := os.environ.get(key)) is not None}


# Process-wide cap on concurrent Tectonic runs; read from the environment, not app.config, so the worker never loads the backend settings.
_compile_slots = asyncio.Semaphore(max(1, int(os.environ.get("LATEX_MAX_CONCURRENT_COMPILES", 2))))


@contextlib.asynccontextmanager
async def _compile_slot(wait_seconds: float) -> AsyncIterator[None]:
    """Hold one Tectonic slot; waiting longer than *wait_seconds* raises TimeoutError."""
    try:
        async with asyncio.timeout(wait_seconds):
            await _compile_slots.acquire()
    except TimeoutError:
        logger.warning("LaTeX compile waited %.0f s for a free slot and gave up", wait_seconds)
        raise
    try:
        yield
    finally:
        _compile_slots.release()


def safe_path(tmpdir: Path, rel_path: str) -> Path:
    """Resolve *rel_path* inside *tmpdir*, refusing anything that escapes it."""
    resolved_root = tmpdir.resolve()
    target = (resolved_root / rel_path).resolve()
    if target != resolved_root and resolved_root not in target.parents:
        raise CompilationError("Invalid extra file path.")
    return target


def _read_tex_log(tmpdir: Path, stderr: bytes) -> str:
    """The full TeX log (stderr if main.log is missing) for the requesting teacher only: the tmpdir path becomes "./" and the size is capped, keeping the tail. Never write it to server logs."""
    log_file = tmpdir / "main.log"
    try:
        text = log_file.read_text(encoding="utf-8", errors="replace") if log_file.exists() else ""
    except OSError:
        text = ""
    if not text.strip():
        text = stderr.decode("utf-8", errors="replace")
    for prefix in {str(tmpdir), str(tmpdir.resolve())}:
        text = text.replace(prefix + os.sep, "./").replace(prefix, ".")
    if len(text) > _MAX_LOG_CHARS:
        text = "[... log truncated ...]\n" + text[-_MAX_LOG_CHARS:]
    return text


def _extract_tex_error(tmpdir: Path) -> str:
    """TeX's own error lines (starting with "!") from main.log: the short ``detail`` that may also be written to server logs. The full log only goes back to the caller (``_read_tex_log``)."""
    log_file = tmpdir / "main.log"
    error_lines: list[str] = []
    if log_file.exists():
        try:
            log_content = log_file.read_text(encoding="utf-8", errors="replace")
        except OSError:
            log_content = ""
        for line in log_content.splitlines():
            stripped = line.strip()
            if stripped.startswith("!"):
                error_lines.append(stripped[:_MAX_ERROR_LINE_CHARS])
            if len(error_lines) >= _MAX_ERROR_LINES:
                break
    if error_lines:
        return " | ".join(error_lines)
    return "No TeX diagnostic was produced; check the document for errors."


async def _run_pass(cmd: list[str], tmpdir: Path, timeout: float, pass_idx: int) -> tuple[int, bytes]:
    # stderr goes to a file, so a pass killed on timeout still shows how far it got.
    err_path = tmpdir / "tectonic.err"
    started = time.monotonic()
    with err_path.open("wb") as err:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=err,
            cwd=str(tmpdir),
            env=_child_env(),
        )
        try:
            await asyncio.wait_for(proc.wait(), timeout=timeout)
            # Duration only: shows how close documents get to the limit before one fails.
            logger.info("Tectonic pass %d took %.1f s", pass_idx, time.monotonic() - started)
        except TimeoutError:
            # Counts only: Tectonic's notes can name files the document asked for, and document content is never logged.
            downloads = err_path.read_bytes().count(b"downloading")
            logger.warning(
                "Tectonic pass %d timed out after %.0f s (%d bundle downloads started)",
                pass_idx, time.monotonic() - started, downloads,
            )
            raise
        finally:
            # Also on CancelledError (client disconnect): never leave an orphaned Tectonic running.
            if proc.returncode is None:
                with contextlib.suppress(ProcessLookupError):
                    proc.kill()
                await proc.wait()
    return proc.returncode or 0, err_path.read_bytes()


async def run_tectonic(main_tex: str, files: dict[str, bytes], timeout: float) -> bytes:
    """Compile *main_tex* with the bundled assets plus *files* (relative path -> bytes, written after the assets) in two passes and return the PDF. Raises CompilationError or TimeoutError."""
    tmpdir = Path(tempfile.mkdtemp(prefix="blindgrade-latex-"))
    try:
        if ASSETS_DIR.exists():
            for item in ASSETS_DIR.iterdir():
                dest = tmpdir / item.name
                if item.is_dir():
                    shutil.copytree(item, dest, dirs_exist_ok=True)
                else:
                    shutil.copy2(item, dest)
        for rel_path, content in files.items():
            target_path = safe_path(tmpdir, rel_path)
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_bytes(content)
        tex_file = tmpdir / "main.tex"
        tex_file.write_text(main_tex, encoding="utf-8")

        # --untrusted refuses shell-escape and extra search paths (not file reads); it must precede the input.
        cmd = [
            "tectonic", "--untrusted", "-k", str(tex_file), "--outdir", str(tmpdir), "--keep-logs",
        ]
        async with _compile_slot(timeout):
            for pass_idx in range(2):
                returncode, stderr = await _run_pass(cmd, tmpdir, timeout, pass_idx + 1)
                logger.debug("LaTeX pass %d finished (exit %d)", pass_idx + 1, returncode)
                if returncode != 0:
                    raise CompilationError(
                        f"LaTeX compilation failed on pass {pass_idx + 1}: "
                        f"{_extract_tex_error(tmpdir)}",
                        log=_read_tex_log(tmpdir, stderr),
                    )
        pdf_path = tmpdir / "main.pdf"
        if not pdf_path.exists():
            raise CompilationError("Tectonic succeeded but main.pdf not found.")
        return pdf_path.read_bytes()
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
