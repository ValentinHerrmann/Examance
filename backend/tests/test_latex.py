"""Unit tests for LaTeX schema, service, and compile endpoint."""
from __future__ import annotations

import pytest

from app.schemas.latex import LaTeXRequest
from app.services.latex import CompilationError, compile_latex


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
async def test_tex_subprocess_args() -> None:
    """Every TeX run is locked down, passes write no PDF, and xdvipdfmx writes it once (issue #341)."""
    import tempfile
    from pathlib import Path
    from unittest.mock import AsyncMock, patch

    captured_args: list[tuple] = []

    async def fake_exec(*args, **kwargs):
        captured_args.append(args)
        mock_proc = AsyncMock()
        mock_proc.returncode = 0
        return mock_proc

    original_mkdtemp = tempfile.mkdtemp

    def fake_mkdtemp(**kwargs):
        d = original_mkdtemp(**kwargs)
        (Path(d) / "main.pdf").write_bytes(b"%PDF-1.4 fake")
        return d

    with patch("asyncio.create_subprocess_exec", side_effect=fake_exec), \
         patch("tempfile.mkdtemp", side_effect=fake_mkdtemp):
        await compile_latex("\\documentclass{article}", preview=True)

    tex_runs = [args for args in captured_args if args[0] == "xelatex"]
    # No aux files settle in this fake, so two passes: the first never counts as settled.
    assert len(tex_runs) == 2
    for args in tex_runs:
        for flag in ("-no-shell-escape", "-no-parse-first-line", "-halt-on-error", "-no-pdf"):
            assert flag in args, args
        assert args[-1] == "main.tex"
    assert captured_args[-1][0] == "xdvipdfmx"
    assert len(captured_args) == 3


def test_split_preamble_ends_at_the_template_load() -> None:
    from app.services.texrunner import split_preamble

    doc = "\\def\\ExamancePackages{}\n\\documentclass{article}\n\\usepackage[sans,punkte]{sty/Schulaufgabe}\n\\Seitencode{1}{2}{3}\n\\begin{document}x\\end{document}"
    head, rest = split_preamble(doc)  # type: ignore[misc]
    assert head.endswith("{sty/Schulaufgabe}")
    assert rest.startswith("\n\\Seitencode")
    # Snippets and documents without the template compile without a format.
    assert split_preamble("\\begin{Aufgabe}{A}x\\end{Aufgabe}") is None
    assert split_preamble("\\documentclass{article}\\begin{document}x\\end{document}") is None


def test_split_preamble_is_linear_on_hostile_input() -> None:
    """CodeQL: the former regex backtracked on many unclosed "\\usepackage[" (issue #341)."""
    import time

    from app.services.texrunner import split_preamble

    hostile = "\\documentclass{article}" + "\\usepackage[" * 200_000 + "{sty/Schulaufgabe}"
    started = time.monotonic()
    split_preamble(hostile)
    assert time.monotonic() - started < 1


def test_format_key_follows_the_preamble() -> None:
    from app.services.texrunner import format_key

    assert format_key("a") == format_key("a")
    assert format_key("a") != format_key("b")


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
        r"\includegraphics{img/figure.png}",
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

    from app.services.texrunner import CompilationError as CE
    from app.services.texrunner import safe_path

    tmpdir = Path(tempfile.mkdtemp())
    assert safe_path(tmpdir, "exercises/ex_1.tex").is_relative_to(tmpdir.resolve())
    for bad in ("../escape.tex", "../../etc/passwd", "/etc/passwd"):
        with pytest.raises(CE, match="Invalid extra file path"):
            safe_path(tmpdir, bad)


def test_tex_error_extraction_does_not_leak_log_context() -> None:
    """main.log echoes source context around an error. Only the TeX diagnostic lines ("!") may reach the client — never the echoed content."""
    import tempfile
    from pathlib import Path

    from app.services.texrunner import _extract_tex_error

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


def test_read_tex_log_hides_tmpdir_and_caps_size() -> None:
    import tempfile
    from pathlib import Path

    from app.services import texrunner as latex_svc

    tmpdir = Path(tempfile.mkdtemp())
    (tmpdir / "main.log").write_text("(" + str(tmpdir) + "/main.tex\n! Boom.\n", encoding="utf-8")
    log = latex_svc._read_tex_log(tmpdir, b"")
    assert str(tmpdir) not in log
    assert "(./main.tex" in log
    assert "! Boom." in log

    (tmpdir / "main.log").unlink()
    assert latex_svc._read_tex_log(tmpdir, b"error: stderr only") == "error: stderr only"

    (tmpdir / "main.log").write_text("x" * (latex_svc._MAX_LOG_CHARS + 10), encoding="utf-8")
    assert len(latex_svc._read_tex_log(tmpdir, b"")) < latex_svc._MAX_LOG_CHARS + 100


def test_parse_exercise_score_lmulti_and_be() -> None:
    from app.services.latex_score import parse_exercise_score

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
async def test_compile_class_diagram_solution_mode() -> None:
    """Class diagram macros (\\operation, \\attribute, etc.) inside \\LoesungKaro
    must compile without 'Missing number' errors in solution mode (Antworten=true)."""
    import shutil
    if not shutil.which("xelatex"):
        pytest.skip("TeX Live xelatex not available")

    snippet = r"""
\setboolean{Antworten}{true}
\begin{Aufgabe}[12]{Klassendiagramm}
Zeichne das Klassendiagramm.
\end{Aufgabe}
\newcommand{\LsgDiagramm}{\begin{tikzpicture}
    \begin{class}[text width = 7.5cm]{Wall}{0,11}
        \attribute{x : int [0,5P]}
        \operation{Wall(posX : int, posY : int) [0,5P]}
    \end{class}
\end{tikzpicture}}
\LoesungKaro{\LsgDiagramm}{40}
"""
    result = await compile_latex(snippet, preview=True)
    assert result.pdf.startswith(b"%PDF-")


@pytest.mark.asyncio
async def test_compile_dot_grid_fields() -> None:
    """\\LoesungPunktraster, \\punktraster and the karopunkte switch on \\LoesungKaro/\\kariert compile (issue #314)."""
    import shutil
    if not shutil.which("xelatex"):
        pytest.skip("TeX Live xelatex not available")

    snippet = r"""
\makeatletter\LSG@punktkarotrue\makeatother
\begin{Aufgabe}[2]{Punktraster}
\LoesungPunktraster{Lösung}{4}
\LoesungKaro{Lösung}{4}
\punktraster[0.5cm]{3}
\kariert{3}
\end{Aufgabe}
"""
    result = await compile_latex(snippet, preview=True)
    assert result.pdf.startswith(b"%PDF-")


@pytest.mark.asyncio
async def test_compile_slots_cap_concurrent_runs(monkeypatch) -> None:
    import asyncio

    from app.services import texrunner

    monkeypatch.setattr(texrunner, "_compile_slots", asyncio.Semaphore(1))
    async with texrunner._compile_slot(1):
        with pytest.raises(TimeoutError):
            async with texrunner._compile_slot(0.05):
                pass
    # Freed on exit, including after a wait that timed out.
    async with texrunner._compile_slot(0.05):
        pass


@pytest.mark.asyncio
async def test_tex_runs_inside_a_compile_slot(monkeypatch) -> None:
    import asyncio
    import tempfile
    from pathlib import Path
    from unittest.mock import AsyncMock, patch

    from app.services import texrunner

    monkeypatch.setattr(texrunner, "_compile_slots", asyncio.Semaphore(1))
    slot_held: list[bool] = []

    async def fake_exec(*args, **kwargs):
        slot_held.append(texrunner._compile_slots.locked())
        proc = AsyncMock()
        proc.returncode = 0
        proc.communicate = AsyncMock(return_value=(b"", b""))
        return proc

    original_mkdtemp = tempfile.mkdtemp

    def fake_mkdtemp(**kwargs):
        d = original_mkdtemp(**kwargs)
        (Path(d) / "main.pdf").write_bytes(b"%PDF-1.4 fake")
        return d

    with patch("asyncio.create_subprocess_exec", side_effect=fake_exec), \
         patch("tempfile.mkdtemp", side_effect=fake_mkdtemp):
        await compile_latex("\\documentclass{article}", preview=True)

    # Two TeX passes (no aux to settle on) and the PDF step, all inside the slot.
    assert slot_held == [True, True, True]
    assert not texrunner._compile_slots.locked()


@pytest.mark.asyncio
async def test_tex_settles_aux_even_from_a_stale_seed() -> None:
    """Issue #341: one compile resolves references, and a stale seeded aux is corrected, not trusted."""
    import shutil
    if not shutil.which("xelatex"):
        pytest.skip("TeX Live xelatex not available")
    from app.services.texrunner import run_tex

    doc = r"""\documentclass{article}
\begin{document}
See \ref{b}.
\section{A}\section{B}\label{b}
\end{document}
"""
    fresh = await run_tex(doc, {}, time_limit=120)
    assert b"\\newlabel{b}{{2}" in fresh.aux["main.aux"]

    stale = fresh.aux["main.aux"].replace(b"{{2}", b"{{7}")
    seeded = await run_tex(doc, {}, time_limit=120, seed_aux={"main.aux": stale})
    assert b"\\newlabel{b}{{2}" in seeded.aux["main.aux"]


@pytest.mark.asyncio
async def test_seed_aux_rejects_unknown_names_and_unsafe_paths() -> None:
    from app.services.texrunner import run_tex

    with pytest.raises(CompilationError):
        await run_tex("\\documentclass{article}", {}, time_limit=1, seed_aux={"evil.tex": b"x"})
    with pytest.raises(CompilationError):
        await compile_latex(
            "\\documentclass{article}", seed_aux={"main.aux": b"\\input{/etc/passwd}"}
        )


@pytest.mark.asyncio
async def test_template_compiles_with_a_cached_format(tmp_path, monkeypatch) -> None:
    """Issue #341: the first compile of a template preamble builds its format, the next one uses it."""
    import shutil
    if not shutil.which("xelatex"):
        pytest.skip("TeX Live xelatex not available")
    from app.services import texrunner

    monkeypatch.setattr(texrunner, "FORMAT_DIR", tmp_path)
    doc = r"""\documentclass[a4paper]{article}
\usepackage[sans,punkte]{sty/Schulaufgabe}
\begin{document}
\begin{Aufgabe}{A}Text \BE\end{Aufgabe}
\end{document}
"""
    first = await texrunner.run_tex(doc, {}, time_limit=120)
    assert len(list(tmp_path.glob("*.fmt"))) == 1
    second = await texrunner.run_tex(doc, {}, time_limit=120, seed_aux=first.aux)
    assert second.pdf.startswith(b"%PDF-")
    assert len(list(tmp_path.glob("*.fmt"))) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("attack", [
    r"\input{/etc/passwd}",
    r"\newread\f\openin\f=../../etc/passwd \read\f to\x \x",
    r"\immediate\write18{touch pwned}",
    r"\newwrite\f\immediate\openout\f=/tmp/examance-escape.txt \immediate\write\f{x}",
])
async def test_documents_cannot_leave_their_directory(attack: str) -> None:
    """The texmf.cnf rules hold without the latex.py tripwire: no shell escape, no reads or writes outside the working directory."""
    import shutil
    from pathlib import Path
    if not shutil.which("xelatex"):
        pytest.skip("TeX Live xelatex not available")
    from app.services.texrunner import run_tex

    doc = "\\documentclass{article}\\begin{document}" + attack + "\\end{document}"
    try:
        result = await run_tex(doc, {}, time_limit=60)
    except CompilationError:
        return
    assert b"root:" not in result.pdf
    assert not Path("/tmp/examance-escape.txt").exists()  # noqa: S108 - the path the attack tried to write
