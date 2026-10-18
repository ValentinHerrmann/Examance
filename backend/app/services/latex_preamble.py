"""Packages and TikZ libraries an exercise loads in its own LaTeX (issue #108).

The compile copies those commands into the preamble; in the body Schulaufgabe.sty turns
``\\usepackage`` of a loaded package into a no-op. Mirrors frontend/src/lib/latex/preamble.ts;
keep the two in sync.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

_PACKAGE_COMMAND = re.compile(
    r"\\(usepackage|usetikzlibrary|usepgfplotslibrary)\s*"
    r"(?:\[((?:[^\[\]{}]|\{[^{}]*\})*)\])?\s*\{([^{}]*)\}"
)
_VERBATIM_BEGIN = re.compile(r"\\begin\s*\{(verbatim\*?|Verbatim|lstlisting|minted|comment)\}")
_INLINE_VERBATIM = re.compile(
    r"\\(?:verb\*?|lstinline(?:\[[^\]]*\])?)(?:\{[^}]*\}|([^\sa-zA-Z{])(?:(?!\1).)*\1)"
)
_COMMENT = re.compile(r"(?<!\\)%")
# pdfLaTeX-only boilerplate of pasted documents; under XeLaTeX fontenc would replace the exam font.
_SKIPPED_PACKAGES = frozenset({"inputenc", "fontenc"})


@dataclass
class ExercisePreamble:
    # \PassOptionsToPackage lines, for before \documentclass, so template packages get them too.
    options: list[str] = field(default_factory=list)
    # \usepackage / \usetikzlibrary / \usepgfplotslibrary lines, for before \begin{document}.
    packages: list[str] = field(default_factory=list)


def _split_list(argument: str) -> list[str]:
    return [item.strip() for item in argument.split(",") if item.strip()]


def _add(lines: list[str], line: str) -> None:
    if line not in lines:
        lines.append(line)


def _collect(result: ExercisePreamble, code: str) -> None:
    for match in _PACKAGE_COMMAND.finditer(code):
        command, raw_options, raw_argument = match.groups()
        opts = (raw_options or "").strip()
        if command != "usepackage":
            libraries = _split_list(raw_argument)
            if libraries:
                _add(result.packages, f"\\{command}{{{','.join(libraries)}}}")
            continue
        names = [name for name in _split_list(raw_argument) if name not in _SKIPPED_PACKAGES]
        if not names:
            continue
        joined = ",".join(names)
        if opts:
            _add(result.options, f"\\PassOptionsToPackage{{{opts}}}{{{joined}}}")
        _add(result.packages, f"\\usepackage{f'[{opts}]' if opts else ''}{{{joined}}}")


def exercise_preamble(latex: str) -> ExercisePreamble:
    """Collect the package commands of *latex*, skipping comments and verbatim; one line each."""
    result = ExercisePreamble()
    verbatim_end: str | None = None
    for line in re.split(r"\r?\n", latex):
        code = _INLINE_VERBATIM.sub("", line)
        if verbatim_end:
            end_at = code.find(verbatim_end)
            if end_at < 0:
                continue
            code = code[end_at + len(verbatim_end):]
            verbatim_end = None
        # Walk the line: whichever comes first, a comment or a verbatim environment, ends the scan.
        while True:
            comment = _COMMENT.search(code)
            begin = _VERBATIM_BEGIN.search(code)
            if not begin or (comment and comment.start() < begin.start()):
                _collect(result, code[: comment.start()] if comment else code)
                break
            _collect(result, code[: begin.start()])
            end = f"\\end{{{begin.group(1)}}}"
            end_at = code.find(end, begin.end())
            if end_at < 0:
                verbatim_end = end
                break
            code = code[end_at + len(end):]
    return result


def with_exercise_preamble(doc: str, source: str | None = None) -> str:
    """Add the package commands found in *source* (default: the body of *doc*) to its preamble."""
    body_start = doc.find("\\begin{document}")
    if body_start < 0:
        return doc
    found = exercise_preamble(doc[body_start:] if source is None else source)
    if not found.options and not found.packages:
        return doc
    class_start = doc.find("\\documentclass")
    if not 0 <= class_start < body_start:
        class_start = 0
    option_block = "".join(f"{line}\n" for line in found.options)
    package_block = "".join(f"{line}\n" for line in found.packages)
    return (
        doc[:class_start]
        + option_block
        + doc[class_start:body_start]
        + package_block
        + doc[body_start:]
    )
