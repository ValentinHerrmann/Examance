"""Unit tests for LaTeX schema, service, and compile endpoint."""
from __future__ import annotations

import pytest

from app.schemas.latex import LaTeXRequest
from app.services.latex import CompilationError, compile_latex, compile_exam_latex


def test_latex_request_repr_redacted() -> None:
    """__repr__ must never expose the latex source."""
    req = LaTeXRequest(latex="\\documentclass{article}\\begin{document}SECRET\\end{document}")
    assert "SECRET" not in repr(req)
    assert "SECRET" not in str(req)
    assert "<redacted>" in repr(req)


def test_latex_request_empty_raises() -> None:
    with pytest.raises(ValueError):
        LaTeXRequest(latex="   ")


@pytest.mark.asyncio
async def test_compile_timeout(monkeypatch) -> None:
    """Verify asyncio.TimeoutError is raised on timeout."""
    import asyncio
    from unittest.mock import patch

    with patch("app.services.latex.compile_latex", side_effect=asyncio.TimeoutError):
        with pytest.raises(asyncio.TimeoutError):
            from app.services.latex import compile_latex as _c
            await _c("whatever")


@pytest.mark.asyncio
async def test_tectonic_subprocess_args() -> None:
    """Verify tectonic subprocess receives main.tex and preview flags."""
    import tempfile
    from pathlib import Path
    from unittest.mock import AsyncMock, patch

    captured_args: list[tuple] = []

    async def fake_exec(*args, **kwargs):
        captured_args.append(args)
        mock_proc = AsyncMock()
        mock_proc.returncode = 0
        mock_proc.communicate = AsyncMock(return_value=(b"", b""))
        return mock_proc

    original_mkdtemp = tempfile.mkdtemp

    def fake_mkdtemp(**kwargs):
        d = original_mkdtemp(**kwargs)
        (Path(d) / "main.pdf").write_bytes(b"%PDF-1.4 fake")
        return d

    with patch("asyncio.create_subprocess_exec", side_effect=fake_exec), \
         patch("tempfile.mkdtemp", side_effect=fake_mkdtemp):
        await compile_latex("\\documentclass{article}", preview=True)

    assert any("tectonic" in args for args in captured_args)
    assert any("-k" in args for args in captured_args)
    assert len(captured_args) == 2

    # --untrusted blocks shell-escape and filesystem access outside the working
    # directory, and must precede the input path to take effect.
    for args in captured_args:
        assert "--untrusted" in args, args
        assert args.index("--untrusted") < args.index("-k"), args


@pytest.mark.parametrize(
    "source",
    [
        r"\input{/etc/passwd}",
        r"\input{/app/.env}",
        r"\include{../../secrets}",
        r"\InputIfFileExists{/proc/self/environ}{}{}",
        r"\includegraphics{../outside.png}",
        r"\lstinputlisting{/app/backend/.env}",
        r"\input {/etc/passwd}",
        r"\includegraphics[width=1cm]{/etc/hostname}",
    ],
)
def test_reject_unsafe_paths_blocks_absolute_and_parent_references(source: str) -> None:
    from app.services.latex import CompilationError as CE
    from app.services.latex import reject_unsafe_paths

    with pytest.raises(CE, match="not permitted"):
        reject_unsafe_paths(source)


@pytest.mark.parametrize(
    "source",
    [
        r"\input{exercises/ex_1.tex}",
        r"\includegraphics{img/Logo.png}",
        r"\usepackage{sty/Schulaufgabe}",
        r"\begin{Aufgabe}{Titel}\BE\end{Aufgabe}",
    ],
)
def test_reject_unsafe_paths_allows_normal_documents(source: str) -> None:
    from app.services.latex import reject_unsafe_paths

    reject_unsafe_paths(source)  # must not raise


@pytest.mark.asyncio
async def test_compile_latex_rejects_absolute_input() -> None:
    """The guard fires before any subprocess is spawned."""
    with pytest.raises(CompilationError, match="not permitted"):
        await compile_latex(r"\documentclass{article}\input{/etc/passwd}")


def test_extra_file_paths_cannot_escape_workdir() -> None:
    import tempfile
    from pathlib import Path

    from app.services.latex import CompilationError as CE
    from app.services.latex import _safe_extra_file_path

    tmpdir = Path(tempfile.mkdtemp())
    assert _safe_extra_file_path(tmpdir, "exercises/ex_1.tex").is_relative_to(tmpdir.resolve())
    for bad in ("../escape.tex", "../../etc/passwd", "/etc/passwd"):
        with pytest.raises(CE, match="Invalid extra file path"):
            _safe_extra_file_path(tmpdir, bad)


def test_tex_error_extraction_does_not_leak_log_context() -> None:
    """
    main.log echoes source context around an error. Only the TeX diagnostic
    lines ("!") may reach the client — never the echoed content.
    """
    import tempfile
    from pathlib import Path

    from app.services.latex import _extract_tex_error

    tmpdir = Path(tempfile.mkdtemp())
    (tmpdir / "main.log").write_text(
        "This is TeX, Version 3.14\n"
        "! Undefined control sequence.\n"
        "l.42 \\badmacro root:x:0:0:SUPERSECRET:/root:/bin/bash\n"
        "Package fontspec Info: something harmless\n"
        "! LaTeX Error: File 'missing.sty' not found.\n",
        encoding="utf-8",
    )

    msg = _extract_tex_error(tmpdir)
    assert "Undefined control sequence" in msg
    assert "File 'missing.sty' not found" in msg
    assert "SUPERSECRET" not in msg
    assert "root:x:0:0" not in msg


def test_parse_exercise_score_lmulti_and_be() -> None:
    from app.routers.exercises import parse_exercise_score

    snippet_1 = """\\begin{Aufgabe}{Grundlagen}
Wie oft wird der Inhalt einer For-Schleife mit dem folgenden Kopf durchlaufen? 
\\emph{for(int i = -1; i > 10; i -= 2)}

\\LoesungMulti[4]{
\\Lmulti{0}
\\multi{unendlich oft}
\\multi{5}
\\multi{4}
}
\\end{Aufgabe}"""

    snippet_2 = """\\begin{Aufgabe}{Tisch}
Programmieren einen Tisch. \\BE
\\end{Aufgabe}"""

    assert parse_exercise_score(snippet_1) == 1.0
    assert parse_exercise_score(snippet_2) == 1.0


def test_format_exercise_latex_cases() -> None:
    from app.services.latex import format_exercise_latex

    # Case 1: Missing both \begin{Aufgabe} and \end{Aufgabe}
    res1 = format_exercise_latex("Berechne 2 + 2.", "Rechnen")
    assert res1 == "\\begin{Aufgabe}{Rechnen}\nBerechne 2 + 2.\n\\end{Aufgabe}"

    # Case 2: Missing only \begin{Aufgabe}
    res2 = format_exercise_latex("Berechne 2 + 2.\n\\end{Aufgabe}", "Rechnen")
    assert res2 == "\\begin{Aufgabe}{Rechnen}\nBerechne 2 + 2.\n\\end{Aufgabe}"

    # Case 3: Missing only \end{Aufgabe}
    res3 = format_exercise_latex("\\begin{Aufgabe}[5]{Rechnen}\nBerechne 2 + 2.", "Rechnen")
    assert res3 == "\\begin{Aufgabe}[5]{Rechnen}\nBerechne 2 + 2.\n\\end{Aufgabe}"

    # Case 4: Already has both tags
    full_snippet = "\\begin{Aufgabe}{Rechnen}\nBerechne 2 + 2.\n\\end{Aufgabe}"
    res4 = format_exercise_latex(full_snippet, "Rechnen")
    assert res4 == full_snippet

    # Case 5: Empty body / None
    res5 = format_exercise_latex(None, "Leere Aufgabe")
    assert res5 == "\\begin{Aufgabe}{Leere Aufgabe}\n\\end{Aufgabe}"

    # Case 6: Title with LaTeX special chars (e.g. the default "New_Exercise"
    # name) must be escaped, or Tectonic fails with "Missing $ inserted"
    # on the bare underscore -- see format_mc_group_latex test below for the
    # exact two-exercise scenario this was reported against.
    res6 = format_exercise_latex("Frage hier eingeben...", "New_Exercise")
    assert res6 == "\\begin{Aufgabe}{New\\_Exercise}\nFrage hier eingeben...\n\\end{Aufgabe}"


def test_escape_tex() -> None:
    from app.services.latex import escape_tex

    assert escape_tex("New_Exercise") == "New\\_Exercise"
    assert escape_tex("100% & #1 ~ ^2 $ \\ {x}") == (
        "100\\% \\& \\#1 \\textasciitilde{} \\textasciicircum{}2 \\$ "
        "\\textbackslash{} \\{x\\}"
    )
    assert escape_tex(None) == ""
    assert escape_tex("") == ""
    assert escape_tex("Plain text") == "Plain text"


def test_format_mc_group_latex_escapes_default_titles() -> None:
    """Two MC exercises left at the default name "New_Exercise" used to
    produce '! Missing $ inserted' on Tectonic pass 1, because the bare
    underscore in the un-renamed title was spliced straight into
    \\begin{Aufgabe}{New_Exercise} (a text-mode LaTeX argument)."""
    from app.services.latex import format_mc_group_latex

    members = [
        {"id": "ex-1", "latex_body": "\\LoesungMulti[2]{\\Lmulti{Richtig} \\multi{Falsch}}"},
        {"id": "ex-2", "latex_body": "\\LoesungMulti[2]{\\Lmulti{Richtig} \\multi{Falsch}}"},
    ]
    result = format_mc_group_latex(members, "New_Exercise", "1BE pro Kreuz")

    assert "\\begin{Aufgabe}{New\\_Exercise}" in result
    assert "New_Exercise}" not in result  # unescaped form must not survive
    assert "\\item \\OmrExercise{ex-1}" in result
    assert "\\item \\OmrExercise{ex-2}" in result


@pytest.mark.asyncio
async def test_compile_latex_auto_wraps_snippet() -> None:
    import tempfile
    from pathlib import Path
    from unittest.mock import AsyncMock, patch

    written_latex: list[str] = []

    async def fake_exec(*args, **kwargs):
        mock_proc = AsyncMock()
        mock_proc.returncode = 0
        mock_proc.communicate = AsyncMock(return_value=(b"", b""))
        return mock_proc

    original_mkdtemp = tempfile.mkdtemp

    def fake_mkdtemp(**kwargs):
        d = original_mkdtemp(**kwargs)
        (Path(d) / "main.pdf").write_bytes(b"%PDF-1.4 fake")
        return d

    with patch("asyncio.create_subprocess_exec", side_effect=fake_exec), \
         patch("tempfile.mkdtemp", side_effect=fake_mkdtemp):
        await compile_latex("\\begin{Aufgabe}{Test}Hello\\end{Aufgabe}", preview=True)

    # Verify auto wrapping added documentclass


@pytest.mark.asyncio
async def test_compile_exam_latex_fallback_wrapping() -> None:
    import tempfile
    from pathlib import Path
    from unittest.mock import AsyncMock, patch
    from types import SimpleNamespace

    captured_files: dict[str, str] = {}

    async def fake_exec(*args, **kwargs):
        mock_proc = AsyncMock()
        mock_proc.returncode = 0
        mock_proc.communicate = AsyncMock(return_value=(b"", b""))
        return mock_proc

    original_mkdtemp = tempfile.mkdtemp

    def fake_mkdtemp(**kwargs):
        d = original_mkdtemp(**kwargs)
        (Path(d) / "main.pdf").write_bytes(b"%PDF-1.4 fake")
        return d

    exam = SimpleNamespace(
        testart="Schulaufgabe",
        klasse="10b",
        datum="2026-07-27",
        nr="1",
        fach="Informatik",
        lehrernachname="Müller",
        info_text="Viel Erfolg!",
    )
    exercises = [
        SimpleNamespace(name="Schleifen", latex_body="Schreibe eine For-Schleife."),
        SimpleNamespace(name="Funktionen", latex_body="\\begin{Aufgabe}{Funktionen}\nDefine foo().\n\\end{Aufgabe}"),
    ]

    with patch("asyncio.create_subprocess_exec", side_effect=fake_exec), \
         patch("tempfile.mkdtemp", side_effect=fake_mkdtemp):
        pdf_bytes = await compile_exam_latex(exam, exercises)

    assert pdf_bytes == b"%PDF-1.4 fake"

