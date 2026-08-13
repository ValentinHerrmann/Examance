"""Async Tectonic LaTeX compilation service."""
from __future__ import annotations

import asyncio
import logging
import re
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

PREVIEW_TIMEOUT_SECONDS = 30
COMPILE_TIMEOUT_SECONDS = 120

# Secondary defence behind `tectonic --untrusted`: reject the obvious ways a
# document asks for a file outside its working directory. TeX can construct
# paths in many ways, so this is a tripwire, not the boundary.
_ABSOLUTE_OR_PARENT_PATH = re.compile(
    r"\\(?:input|include|InputIfFileExists|openin|openout|write|read"
    r"|lstinputlisting|includegraphics|import|subimport|verbatiminput)"
    r"\s*(?:\[[^\]]*\])?\s*\{?\s*(?:/|\.\./|~|\\\\)",
)

ASSETS_DIR = Path(__file__).resolve().parents[2] / "latex-assets"
if not ASSETS_DIR.exists():
    ASSETS_DIR = Path("latex-assets")


class CompilationError(Exception):
    """Raised when Tectonic exits non-zero or the process fails."""


_TEX_ESCAPE_MAP = {
    "\\": r"\textbackslash{}",
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}


def escape_tex(text: str | None) -> str:
    """
    Escape LaTeX special characters in plain (non-LaTeX) user text before
    it's interpolated into a command argument, e.g. \\begin{Aufgabe}{<title>}.

    Do NOT use this on fields that are legitimately raw LaTeX by design
    (`latex_body`, `info_text`/`\\Info{}`) -- only on plain-text metadata
    like titles, scoring text, class, date, etc.
    """
    if not text:
        return ""
    # Single pass over the original characters (not sequential str.replace
    # calls), so an escaped char's own backslash never gets re-escaped.
    return "".join(_TEX_ESCAPE_MAP.get(ch, ch) for ch in text)


def reject_unsafe_paths(latex_source: str) -> None:
    """
    Raise CompilationError if *latex_source* references an absolute or parent path.

    A TeX document can read arbitrary files (``\\input{/app/.env}``) and typeset
    them into the resulting PDF. ``--untrusted`` is the real control; this check
    fails fast with a clearer message and covers the common cases.
    """
    if _ABSOLUTE_OR_PARENT_PATH.search(latex_source):
        raise CompilationError(
            "Absolute and parent-directory file references are not permitted."
        )


def _safe_extra_file_path(tmpdir: Path, rel_path: str) -> Path:
    """
    Resolve *rel_path* inside *tmpdir*, refusing anything that escapes it.

    Callers currently pass server-generated names, but this function is public
    and one caller change away from being an arbitrary-write primitive.
    """
    resolved_root = tmpdir.resolve()
    target = (resolved_root / rel_path).resolve()
    if target != resolved_root and resolved_root not in target.parents:
        raise CompilationError("Invalid extra file path.")
    return target


_MAX_ERROR_LINES = 5
_MAX_ERROR_LINE_CHARS = 200


def _extract_tex_error(tmpdir: Path) -> str:
    """
    Extract the TeX diagnostic lines from main.log, and nothing else.

    Only lines TeX itself emits as errors (those beginning with "!") are kept.
    The surrounding log echoes source context — including the contents of any
    file the document pulled in — so forwarding arbitrary log or stderr text to
    the caller would turn a failed compile into a file-disclosure channel.
    """
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


async def compile_latex(
    latex_source: str,
    extra_files: dict[str, str] | None = None,
    preview: bool = True,
) -> bytes:
    """
    Compile *latex_source* with Tectonic and return raw PDF bytes.

    Copies sty/ and img/ from ASSETS_DIR into temp working directory.
    """
    reject_unsafe_paths(latex_source)
    for content in (extra_files or {}).values():
        reject_unsafe_paths(content)

    if "\\documentclass" not in latex_source:
        latex_source = f"""\\documentclass[a4paper]{{article}}
\\usepackage[sans,punkte]{{sty/Schulaufgabe}}
\\usetikzlibrary{{shapes.geometric, arrows}}
\\usepackage{{sty/tikz-uml}}
\\neverindent
\\WarningsOff
\\begin{{document}}
{latex_source}
\\end{{document}}
"""

    tmpdir = Path(tempfile.mkdtemp(prefix="blindgrade-latex-"))
    timeout = PREVIEW_TIMEOUT_SECONDS if preview else COMPILE_TIMEOUT_SECONDS
    try:
        # Copy style and image assets if available
        if ASSETS_DIR.exists():
            for item in ASSETS_DIR.iterdir():
                dest = tmpdir / item.name
                if item.is_dir():
                    shutil.copytree(item, dest, dirs_exist_ok=True)
                else:
                    shutil.copy2(item, dest)

        # Write extra files (e.g. exercise fragments)
        if extra_files:
            for rel_path, content in extra_files.items():
                target_path = _safe_extra_file_path(tmpdir, rel_path)
                target_path.parent.mkdir(parents=True, exist_ok=True)
                target_path.write_text(content, encoding="utf-8")

        tex_file = tmpdir / "main.tex"
        tex_file.write_text(latex_source, encoding="utf-8")

        # Document content is NEVER logged — see schemas/latex.py. Sizes only.
        logger.debug(
            "Starting LaTeX compilation (preview=%s, main.tex=%d chars, extra_files=%d)",
            preview,
            len(latex_source),
            len(extra_files or {}),
        )

        cmd = [
            "tectonic",
            # Refuses shell-escape and filesystem access outside the working
            # directory. Must precede the input path.
            "--untrusted",
            "-k",
            str(tex_file),
            "--outdir",
            str(tmpdir),
            "--keep-logs",
        ]

        passes = 2
        for pass_idx in range(passes):
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(tmpdir),
            )

            try:
                _stdout, _stderr = await asyncio.wait_for(
                    proc.communicate(), timeout=timeout
                )
            except asyncio.TimeoutError:
                proc.kill()
                await proc.communicate()
                raise

            logger.debug(
                "LaTeX pass %d finished (exit %d)", pass_idx + 1, proc.returncode
            )

            if proc.returncode != 0:
                err_snippet = _extract_tex_error(tmpdir)
                raise CompilationError(
                    f"LaTeX compilation failed on pass {pass_idx + 1}: {err_snippet}"
                )

        pdf_path = tmpdir / "main.pdf"
        if not pdf_path.exists():
            raise CompilationError("Tectonic succeeded but main.pdf not found.")

        return pdf_path.read_bytes()

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def format_exercise_latex(latex_body: str | None, title: str, exercise_id: Any = None) -> str:
    """
    Format exercise LaTeX code ensuring \\begin{Aufgabe}{<title>} and \\end{Aufgabe} tags exist.
    - If \\begin{Aufgabe} is missing, prepends \\begin{Aufgabe}{<title>}.
    - If \\end{Aufgabe} is missing, appends \\end{Aufgabe}.

    If `exercise_id` is given, injects `\\OmrExercise{<id>}` right before the body
    (mirrors frontend/src/lib/latex/scoreParser.ts::formatExerciseLatex). Inert
    unless the body uses \\multi/\\Lmulti (Loesung.sty), so it's safe to inject
    unconditionally, including for free-text exercises.
    """
    body = latex_body or ""
    if exercise_id:
        body = f"\\OmrExercise{{{exercise_id}}}\n{body}"
    prefix = ""
    suffix = ""

    if r"\begin{Aufgabe}" not in body:
        prefix = f"\\begin{{Aufgabe}}{{{escape_tex(title)}}}\n"

    if r"\end{Aufgabe}" not in body:
        if body and not body.endswith("\n"):
            suffix = "\n\\end{Aufgabe}"
        else:
            suffix = "\\end{Aufgabe}"

    return f"{prefix}{body}{suffix}"


def format_mc_group_latex(
    members: list[Any],
    group_title: str,
    scoring_text: str,
) -> str:
    """
    Build one \\begin{Aufgabe} block with enumerate[label=\\alph*)] for an MC group.

    Each member gets `\\OmrExercise{<id>}` injected before its body -- grading
    and statistics still key strictly on exerciseId (CLAUDE.md invariant); the
    group remains layout-only.
    """

    def _member_id(ex: Any) -> Any:
        return ex.get("id") if isinstance(ex, dict) else getattr(ex, "id", None)

    def _member_latex_body(ex: Any) -> str:
        body = ex.get("latex_body") if isinstance(ex, dict) else getattr(ex, "latex_body", None)
        return body or ""

    items = "\n".join(
        f"\\item \\OmrExercise{{{_member_id(ex)}}}\n{_member_latex_body(ex)}" for ex in members
    )
    return (
        f"\\begin{{Aufgabe}}{{{escape_tex(group_title)}}}"
        f" Kreuze jeweils die korrekten Lösungen an. Mehrere können, mind. eine ist jeweils richtig."
        f" Für falsch gesetzte Kreuze werden Punkte abgezogen (pro Teilaufgabe immer $\\geq 0$ Punkte)\n\n"
        f"\\begin{{enumerate}}[label=\\alph*)]\n"
        f"{items}\n"
        f"\\end{{enumerate}}\n\n"
        f"\\LoesungLeer{{{escape_tex(scoring_text)}}}{{0pt}}\n"
        f"\\end{{Aufgabe}}"
    )


async def compile_exam_latex(
    exam_model: Any,
    exercises: list[tuple[Any, int, uuid.UUID | None, int | None]],
    mc_groups: list[Any] | None = None,
    show_answers: bool = False,
) -> bytes:
    """
    Build complete LaTeX document for an Exam model and compile it.

    exercises: list of (Exercise, order_index, mc_group_id, sub_index)
    mc_groups: list of ExamMcGroup (or dicts) with id, title, scoring_text, order_index
    """
    extra_files: dict[str, str] = {}
    exercise_inputs: list[str] = []

    # Build mc_group lookup: id -> (group_obj, sorted_members)
    mc_group_map: dict[uuid.UUID, tuple[Any, list[Any]]] = {}
    if mc_groups:
        for g in mc_groups:
            gid = getattr(g, "id", None) or (g.get("id") if isinstance(g, dict) else None)
            if gid:
                mc_group_map[gid] = (g, [])

    # Assign exercises to groups or keep as solo
    solo_exercises: list[tuple[Any, int]] = []
    for idx, item in enumerate(exercises, start=1):
        if isinstance(item, tuple):
            if len(item) == 4:
                ex, order_idx, mc_group_id, sub_idx = item
            else:
                ex, order_idx = item[0], item[1]
                mc_group_id, sub_idx = None, None
        else:
            ex = item
            order_idx = getattr(ex, "order_index", idx) or idx
            mc_group_id, sub_idx = None, None

        if mc_group_id and mc_group_id in mc_group_map:
            mc_group_map[mc_group_id][1].append((ex, sub_idx or 0))
        else:
            solo_exercises.append((ex, order_idx or idx))

    # Collect all items (solo or mc_group) with their order_index for sorting
    items_with_order: list[tuple[int, str, str]] = []  # (order_index, filename, latex)

    for ex, order_idx in solo_exercises:
        filename = f"exercises/ex_{order_idx}.tex"
        ex_name = getattr(ex, "name", None) or (ex.get("name") if isinstance(ex, dict) else None)
        title = ex_name or f"Aufgabe {order_idx}"
        latex_body = getattr(ex, "latex_body", None) if not isinstance(ex, dict) else ex.get("latex_body")
        ex_id = ex.get("id") if isinstance(ex, dict) else getattr(ex, "id", None)
        ex_latex = format_exercise_latex(latex_body, title, ex_id)
        items_with_order.append((order_idx, filename, ex_latex))

    if mc_groups:
        for g in mc_groups:
            gid = getattr(g, "id", None) or (g.get("id") if isinstance(g, dict) else None)
            if not gid or gid not in mc_group_map:
                continue
            _, members_with_sub = mc_group_map[gid]
            members_sorted = [ex for ex, _ in sorted(members_with_sub, key=lambda t: t[1])]
            g_order = getattr(g, "order_index", None) or (g.get("order_index") if isinstance(g, dict) else 1) or 1
            g_title = getattr(g, "title", None) or (g.get("title") if isinstance(g, dict) else "Grundlagen") or "Grundlagen"
            g_scoring = (
                getattr(g, "scoring_text", None)
                or (g.get("scoring_text") if isinstance(g, dict) else None)
                or "Für jedes korrekte Kreuz 1BE; für jedes falsche Kreuz -0,5BE. Pro Teilaufgabe aber immer $\\geq$0BE"
            )
            filename = f"exercises/mc_group_{gid}.tex"
            items_with_order.append((g_order, filename, format_mc_group_latex(members_sorted, g_title, g_scoring)))

    items_with_order.sort(key=lambda t: t[0])
    for _, filename, latex in items_with_order:
        extra_files[filename] = latex
        exercise_inputs.append(f"\\input{{{filename}}}")

    opts = ["sans", "punkte"]
    if show_answers:
        opts.append("antworten")
    opts_str = ",".join(opts)

    # Plain-text metadata -- escaped before interpolation into LaTeX macro
    # args below. info_text is intentionally NOT escaped: \Info{} holds raw
    # LaTeX markup by convention (e.g. \begin{itemize}...\end{itemize}).
    testart = escape_tex(exam_model.testart or "Kurzarbeit")
    klasse = escape_tex(exam_model.klasse or "")
    datum = escape_tex(exam_model.datum or "")
    nr = escape_tex(exam_model.nr or "1")
    fach = escape_tex(exam_model.fach or "Informatik")
    lehrernachname = escape_tex(exam_model.lehrernachname or "")
    info_text = exam_model.info_text or ""

    inputs_str = "\n\n".join(exercise_inputs)

    main_tex = f"""\\documentclass[a4paper]{{article}}
\\usepackage[{opts_str}]{{sty/Schulaufgabe}}

\\Info{{{info_text}}}
\\Fach{{{fach}}}
\\Lehrernachname{{{lehrernachname}}}
\\usepackage{{fontspec}}

\\usetikzlibrary{{shapes.geometric, arrows}}
\\usepackage{{sty/tikz-uml}}

\\neverindent
\\WarningsOff

\\begin{{document}}
\\Testart{{{testart}}}
\\Klasse{{{klasse}}}
\\Datum{{{datum}}}
\\Nr{{{nr}}}

{inputs_str}

\\end{{document}}
"""

    return await compile_latex(main_tex, extra_files=extra_files, preview=False)
