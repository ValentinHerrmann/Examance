"""LaTeX runner shared by the backend and the LaTeX worker (`app/latex_worker.py`): TeX Live XeLaTeX with a format per template preamble (issue #341). Imports nothing that loads settings or secrets: the worker container runs it without either."""
from __future__ import annotations

import asyncio
import contextlib
import hashlib
import logging
import os
import shutil
import tempfile
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

PREVIEW_TIMEOUT_SECONDS = 30
COMPILE_TIMEOUT_SECONDS = 120

# Documents are untrusted: our texmf.cnf (read first through TEXMFCNF) forbids shell escape and reads or writes outside the working directory; secrets stay out of the child's environment anyway, and in production TeX runs in the worker.
_CHILD_ENV_KEYS = ("PATH", "HOME", "LANG", "LC_ALL", "TZ", "XDG_CACHE_HOME")

_BACKEND_DIR = Path(__file__).resolve().parents[2]
ASSETS_DIR = _BACKEND_DIR / "latex-assets"
if not ASSETS_DIR.exists():
    ASSETS_DIR = Path("latex-assets")
CONFIG_DIR = _BACKEND_DIR / "latex-texlive"
# Formats built from template preambles; documents cannot write here (openout_any = p keeps their writes in the working directory).
FORMAT_DIR = Path(os.environ.get("LATEX_FORMAT_DIR", Path(tempfile.gettempdir()) / "examance-latex-formats"))
FORMAT_CACHE_ENTRIES = 64
FORMAT_CACHE_BYTES = 2 * 1024**3

_MAX_ERROR_LINES = 5
_MAX_ERROR_LINE_CHARS = 200
_MAX_LOG_CHARS = 256 * 1024

# Auxiliary files a compile hands back and accepts as seeds (issue #341): a seeded run usually needs one TeX pass, not two.
AUX_FILE_NAMES = ("main.aux", "main.toc", "main.out")
MAX_AUX_FILE_BYTES = 512 * 1024
# Passes until the aux files settle; the browser engine uses the same limit (compiler.worker.ts).
MAX_TEX_PASSES = 4

_TEX_FLAGS = ["-no-shell-escape", "-no-parse-first-line", "-interaction=nonstopmode", "-halt-on-error"]
# The format ends right after the template load: everything before it is the same for every exam with the same layout options and packages.
_TEMPLATE_NAME = "{sty/Schulaufgabe}"
# XeTeX cannot dump OpenType fonts and the kernel loads one as soon as a font is selected: the dump runs in OT1 without Libertine (packages.sty), the document switches back after \endofdump.
_BEFORE_DUMP = "\\def\\ExamanceDeferFonts{}\\def\\encodingdefault{OT1}\\fontencoding{OT1}\n"
_AFTER_DUMP = (
    "\n\\csname endofdump\\endcsname\n"
    "\\def\\encodingdefault{TU}\\fontencoding{TU}\\RequirePackage{libertine}\\selectfont\n"
)


@dataclass(frozen=True)
class TexResult:
    pdf: bytes
    aux: dict[str, bytes] = field(default_factory=dict)


class CompilationError(Exception):
    """Raised when TeX exits non-zero or the process fails. *log* is the sanitized TeX log (``_read_tex_log``), returned only to the requesting teacher and never logged (issue #166)."""

    def __init__(self, message: str, log: str | None = None) -> None:
        super().__init__(message)
        self.log = log


def _child_env() -> dict[str, str]:
    env = {key: value for key in _CHILD_ENV_KEYS if (value := os.environ.get(key)) is not None}
    # The trailing ":" appends the distribution's defaults after ours.
    env["TEXMFCNF"] = f"{CONFIG_DIR}:"
    env["TEXFORMATS"] = f"{FORMAT_DIR}:"
    return env


# Process-wide cap on concurrent TeX runs; read from the environment, not app.config, so the worker never loads the backend settings.
_compile_slots = asyncio.Semaphore(max(1, int(os.environ.get("LATEX_MAX_CONCURRENT_COMPILES", 2))))


@contextlib.asynccontextmanager
async def _compile_slot(wait_seconds: float) -> AsyncIterator[None]:
    """Hold one TeX slot; waiting longer than *wait_seconds* raises TimeoutError."""
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


async def _run(cmd: list[str], cwd: Path, deadline: float, label: str) -> tuple[int, bytes]:
    """Run one TeX tool in *cwd* until *deadline* (monotonic); stderr goes to a file, so a run killed on timeout still shows how far it got."""
    err_path = cwd / f"{label}.err"
    with err_path.open("wb") as err:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=err, cwd=str(cwd), env=_child_env(),
        )
        try:
            await asyncio.wait_for(proc.wait(), timeout=max(0.1, deadline - time.monotonic()))
        except TimeoutError:
            # The step only: document content is never logged.
            logger.warning("LaTeX %s timed out", label)
            raise
        finally:
            # Also on CancelledError (client disconnect): never leave an orphaned TeX running.
            if proc.returncode is None:
                with contextlib.suppress(ProcessLookupError):
                    proc.kill()
                await proc.wait()
    return proc.returncode or 0, err_path.read_bytes()


def _copy_assets(target: Path) -> None:
    if ASSETS_DIR.exists():
        for item in ASSETS_DIR.iterdir():
            dest = target / item.name
            if item.is_dir():
                shutil.copytree(item, dest, dirs_exist_ok=True)
            else:
                shutil.copy2(item, dest)


_assets_digest: str | None = None


def _environment_digest() -> str:
    """What a format depends on besides its preamble: the bundled assets and the TeX Live installation."""
    global _assets_digest
    if _assets_digest is None:
        h = hashlib.sha256(os.environ.get("TL_SNAPSHOT", "").encode())
        h.update(str(shutil.which("xelatex")).encode())
        # The dump wrapper and our TeX Live config shape the format too; the format volume outlives deploys.
        h.update((_BEFORE_DUMP + _AFTER_DUMP).encode())
        for root in (ASSETS_DIR, CONFIG_DIR):
            if root.exists():
                for path in sorted(p for p in root.rglob("*") if p.is_file()):
                    h.update(str(path.relative_to(root)).encode() + b"\0" + path.read_bytes())
        _assets_digest = h.hexdigest()
    return _assets_digest


def split_preamble(main_tex: str) -> tuple[str, str] | None:
    """The document as (part up to and including the template load, rest), or None when it does not load the template."""
    # Plain string searches, no regex: documents are untrusted and a backtracking pattern could be made to run for minutes.
    name_at = main_tex.find(_TEMPLATE_NAME)
    class_at = main_tex.find("\\documentclass")
    if name_at < 0 or class_at < 0 or class_at > name_at:
        return None
    head = main_tex[:name_at]
    if head.endswith("]"):
        head = head[: head.rfind("[")] if "[" in head else ""
    if not head.endswith("\\usepackage"):
        return None
    end = name_at + len(_TEMPLATE_NAME)
    return main_tex[:end], main_tex[end:]


def format_key(preamble: str) -> str:
    return hashlib.sha256((_environment_digest() + "\0" + preamble).encode()).hexdigest()[:40]


def _prune_formats() -> None:
    """Least recently used formats go first, over FORMAT_CACHE_ENTRIES or FORMAT_CACHE_BYTES."""
    stats: list[tuple[float, int, Path]] = []
    for path in FORMAT_DIR.glob("*.fmt"):
        # Another worker process may prune the same directory at the same time.
        with contextlib.suppress(OSError):
            st = path.stat()
            stats.append((st.st_mtime, st.st_size, path))
    total = 0
    for index, (_mtime, size, path) in enumerate(sorted(stats, key=lambda s: s[0], reverse=True)):
        total += size
        if index >= FORMAT_CACHE_ENTRIES or total > FORMAT_CACHE_BYTES:
            with contextlib.suppress(OSError):
                path.unlink(missing_ok=True)


_format_locks: dict[str, asyncio.Lock] = {}
# Preambles whose format failed to build in this process (e.g. a package loads a native font at load time): they compile plainly at once.
_failed_formats: set[str] = set()
_MAX_FAILED_FORMATS = FORMAT_CACHE_ENTRIES * 4


async def _ensure_format(preamble: str, deadline: float) -> str | None:
    """The format name for *preamble*, built on first use; None when it cannot be built (the caller then compiles without one)."""
    key = format_key(preamble)
    if key in _failed_formats:
        return None
    lock = _format_locks.setdefault(key, asyncio.Lock())
    try:
        async with lock:
            return await _build_format(key, preamble, deadline)
    finally:
        # Drop the lock once nobody holds or waits on it, so the dict stays as small as the set of builds in flight.
        if not lock.locked() and not getattr(lock, "_waiters", None):
            _format_locks.pop(key, None)


async def _build_format(key: str, preamble: str, deadline: float) -> str | None:
    path = FORMAT_DIR / f"{key}.fmt"
    if path.exists():
        with contextlib.suppress(OSError):
            os.utime(path)
        return key
    if key in _failed_formats:
        return None
    started = time.monotonic()
    work = Path(tempfile.mkdtemp(prefix="examance-format-"))
    try:
        _copy_assets(work)
        (work / "fmt.tex").write_text(_BEFORE_DUMP + preamble + _AFTER_DUMP, encoding="utf-8")
        cmd = ["xelatex", "-ini", *_TEX_FLAGS, f"-jobname={key}", "&xelatex", "mylatexformat.ltx", "fmt.tex"]
        returncode, _ = await _run(cmd, work, deadline, "format")
        built = work / f"{key}.fmt"
        if returncode != 0 or not built.exists():
            # A preamble the format cannot hold still compiles, just without the head start; remembered so it never retries.
            if len(_failed_formats) >= _MAX_FAILED_FORMATS:
                _failed_formats.clear()
            _failed_formats.add(key)
            logger.info("LaTeX format build failed after %.1f s; compiling without", time.monotonic() - started)
            return None
        FORMAT_DIR.mkdir(parents=True, exist_ok=True)
        partial = FORMAT_DIR / f"{key}.fmt.part"
        shutil.copyfile(built, partial)
        os.replace(partial, path)
    except TimeoutError:
        # TimeoutError is an OSError: it must reach the caller, not count as a storage failure.
        raise
    except OSError as exc:
        logger.warning("LaTeX format could not be stored: %s", exc)
        return None
    finally:
        shutil.rmtree(work, ignore_errors=True)
    _prune_formats()
    logger.info("LaTeX format built in %.1f s", time.monotonic() - started)
    return key


def _read_aux_files(tmpdir: Path) -> dict[str, bytes]:
    aux: dict[str, bytes] = {}
    for name in AUX_FILE_NAMES:
        path = tmpdir / name
        if path.is_file() and 0 < path.stat().st_size <= MAX_AUX_FILE_BYTES:
            aux[name] = path.read_bytes()
    return aux


def _prepare_workdir(tmpdir: Path, files: dict[str, bytes], seed_aux: dict[str, bytes]) -> None:
    _copy_assets(tmpdir)
    for rel_path, content in files.items():
        target_path = safe_path(tmpdir, rel_path)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(content)
    for name, content in seed_aux.items():
        if name not in AUX_FILE_NAMES or len(content) > MAX_AUX_FILE_BYTES:
            raise CompilationError("Invalid auxiliary file.")
        (tmpdir / name).write_bytes(content)


async def _run_passes(tmpdir: Path, fmt_args: list[str], seeded: bool, deadline: float) -> int:
    """XeLaTeX without PDF output until the aux files settle (at most MAX_TEX_PASSES); returns the number of passes."""
    aux = _read_aux_files(tmpdir)
    passes = 0
    while True:
        passes += 1
        cmd = ["xelatex", *_TEX_FLAGS, "-no-pdf", *fmt_args, "main.tex"]
        returncode, stderr = await _run(cmd, tmpdir, deadline, "xelatex")
        if returncode != 0:
            raise CompilationError(
                f"LaTeX compilation failed: {_extract_tex_error(tmpdir)}",
                log=_read_tex_log(tmpdir, stderr),
            )
        # A first run without seeds read no aux at all, so it never counts as settled.
        settled = _read_aux_files(tmpdir)
        if (settled == aux and (passes > 1 or seeded)) or passes >= MAX_TEX_PASSES:
            return passes
        aux = settled


async def _run_passes_or_unseeded(tmpdir: Path, fmt_args: list[str], seeded: bool, deadline: float) -> int:
    """``_run_passes``, retried once without the seeds when a seeded run fails: a stale seed (a macro the document no longer defines) must not fail the compile."""
    try:
        return await _run_passes(tmpdir, fmt_args, seeded, deadline)
    except CompilationError:
        if not seeded:
            raise
    for name in AUX_FILE_NAMES:
        (tmpdir / name).unlink(missing_ok=True)
    return await _run_passes(tmpdir, fmt_args, False, deadline)


async def run_tex(
    main_tex: str,
    files: dict[str, bytes],
    time_limit: float,
    seed_aux: dict[str, bytes] | None = None,
) -> TexResult:
    """Compile *main_tex* with the bundled assets plus *files* (relative path -> bytes, written after the assets) and return the PDF and the aux files. TeX runs until the aux files settle, starting from *seed_aux* (names from AUX_FILE_NAMES) when given; the PDF is written once at the end. Raises CompilationError or TimeoutError."""
    tmpdir = Path(tempfile.mkdtemp(prefix="blindgrade-latex-"))
    try:
        _prepare_workdir(tmpdir, files, seed_aux or {})
        async with _compile_slot(time_limit):
            # The run gets the whole limit; the wait for a slot has its own.
            started = time.monotonic()
            deadline = started + time_limit
            fmt_args: list[str] = []
            parts = split_preamble(main_tex)
            if parts is not None and (fmt := await _ensure_format(parts[0], deadline)) is not None:
                fmt_args = [f"-fmt={fmt}"]
                main_tex = _BEFORE_DUMP + parts[0] + _AFTER_DUMP + parts[1]
            (tmpdir / "main.tex").write_text(main_tex, encoding="utf-8")
            format_ready = time.monotonic()
            passes = await _run_passes_or_unseeded(tmpdir, fmt_args, bool(seed_aux), deadline)
            returncode, stderr = await _run(
                ["xdvipdfmx", "-q", "-E", "-o", "main.pdf", "main.xdv"], tmpdir, deadline, "xdvipdfmx",
            )
        # Durations and counts only: shows where the time goes; document content is never logged.
        logger.info(
            "LaTeX compile took %.1f s (format %s %.1f s, %d passes, seeded=%s)",
            time.monotonic() - started, "used" if fmt_args else "none",
            format_ready - started, passes, bool(seed_aux),
        )
        pdf_path = tmpdir / "main.pdf"
        if returncode != 0 or not pdf_path.exists():
            raise CompilationError(
                "LaTeX compilation failed: the PDF could not be written.",
                log=_read_tex_log(tmpdir, stderr),
            )
        return TexResult(pdf=pdf_path.read_bytes(), aux=_read_aux_files(tmpdir))
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
