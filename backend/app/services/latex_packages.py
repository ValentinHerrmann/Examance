"""LaTeX packages chosen in Examance: account, exam and exercise levels (issue #108).

Every level is a list of entries; ``resolve_packages`` merges them into one set without option
clashes and ``with_packages`` writes it before ``\\documentclass`` (packages.sty loads it before
hyperref).
Rules: docs/dev/latex_packages.md. Mirrors frontend/src/lib/latex/packages.ts; keep the two in sync.
"""
from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Literal, cast

PackageKind = Literal["package", "tikzlibrary", "pgfplotslibrary"]
LayerSource = Literal["account", "exam", "exercise", "auto"]
PACKAGE_KINDS: tuple[PackageKind, ...] = ("package", "tikzlibrary", "pgfplotslibrary")

MAX_ENTRIES = 50
MAX_OPTIONS_LENGTH = 300
NAME_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}")
# Options typed in the settings stay declarative: no commands, comments, parameters or brackets.
_FORBIDDEN_OPTION_CHARS = re.compile(r"[\\%#\[\]\n\r]")

# Packages that cannot work with the template, by reason code (the UI explains each).
FORBIDDEN_PACKAGES: dict[str, str] = {
    "inputenc": "xetex",
    "fontenc": "xetex",
    "paralist": "enumitem",
}
# Template packages whose options would move the page layout or break the OMR links.
LOCKED_PACKAGES: dict[str, str] = {"geometry": "layout", "hyperref": "omr", "eso-pic": "omr"}
# Packages replaced by an option of a template package.
PACKAGE_ALIASES: dict[str, tuple[str, str]] = {"enumerate": ("enumitem", "shortlabels")}
# Packages that have to load after hyperref.
AFTER_HYPERREF: frozenset[str] = frozenset(
    {"cleveref", "bookmark", "hypcap", "glossaries", "glossaries-extra"}
)


@dataclass(frozen=True)
class PackageEntry:
    kind: PackageKind
    name: str
    options: str = ""
    # Exam level only: leave out a package the account adds.
    disabled: bool = False


@dataclass(frozen=True)
class SourceRef:
    source: LayerSource
    label: str = ""


@dataclass(frozen=True)
class PackageLayer:
    source: LayerSource
    entries: Sequence[PackageEntry]
    label: str = ""


@dataclass(frozen=True)
class PackageNote:
    # conflict: two exercises disagree on an option; override: a later level changed one; ignored:
    # unsupported (detail = reason); aliased: replaced by a template option (detail = target);
    # kept: the exam left out a package an exercise needs; added: pgfplots for its libraries.
    code: str
    kind: PackageKind
    name: str
    detail: str = ""
    sources: tuple[SourceRef, ...] = ()


@dataclass
class ResolvedPackage:
    kind: PackageKind
    name: str
    options: list[str] = field(default_factory=list)
    sources: list[SourceRef] = field(default_factory=list)


@dataclass
class ResolvedPackages:
    packages: list[ResolvedPackage]
    notes: list[PackageNote]


def _braces_balanced(text: str) -> bool:
    depth = 0
    for char in text:
        depth += {"{": 1, "}": -1}.get(char, 0)
        if depth < 0:
            return False
    return depth == 0


def entry_error(kind: str, name: str, options: str) -> str | None:
    """Why an entry typed in the settings cannot be stored, as a code the UI translates."""
    if kind not in PACKAGE_KINDS:
        return "kind"
    if not NAME_PATTERN.fullmatch(name):
        return "name"
    if options and (
        kind != "package"
        or len(options) > MAX_OPTIONS_LENGTH
        or _FORBIDDEN_OPTION_CHARS.search(options)
        or not _braces_balanced(options)
    ):
        return "options"
    if kind == "package" and name in FORBIDDEN_PACKAGES:
        return "forbidden"
    if kind == "package" and name in LOCKED_PACKAGES:
        return "locked"
    return None


def entries_error(entries: Sequence[PackageEntry]) -> str | None:
    """Like ``entry_error`` for a whole level, which also may not name a package twice."""
    if len(entries) > MAX_ENTRIES:
        return "tooMany"
    seen: set[tuple[str, str]] = set()
    for entry in entries:
        error = entry_error(entry.kind, entry.name, entry.options)
        if error:
            return error
        if (entry.kind, entry.name) in seen:
            return "duplicate"
        seen.add((entry.kind, entry.name))
    return None


def stored_entries(value: object) -> list[PackageEntry]:
    """Entries of a JSON column, skipping malformed ones (or a package unsupported since)."""
    entries: list[PackageEntry] = []
    for item in value if isinstance(value, list) else []:
        if not isinstance(item, dict):
            continue
        kind, name, options = item.get("kind", "package"), item.get("name"), item.get("options", "")
        if not isinstance(kind, str) or not isinstance(name, str) or not isinstance(options, str):
            continue
        if entry_error(kind, name, options) is None:
            entries.append(
                PackageEntry(cast(PackageKind, kind), name, options, item.get("disabled") is True)
            )
    return entries


def split_options(options: str) -> list[str]:
    """Top-level comma-separated items, trimmed, ``key = value`` written as ``key=value``."""
    items: list[str] = []
    depth = 0
    current = ""
    for char in options:
        depth += {"{": 1, "}": -1}.get(char, 0)
        if char == "," and depth == 0:
            items.append(current)
            current = ""
        else:
            current += char
    items.append(current)
    result = []
    for item in items:
        key, sep, value = item.partition("=")
        normalized = f"{key.strip()}={value.strip()}" if sep else key.strip()
        if normalized:
            result.append(normalized)
    return result


# --- Package commands in exercise bodies --------------------------------------------------------

_PACKAGE_COMMAND = re.compile(
    r"\\(usepackage|usetikzlibrary|usepgfplotslibrary)\s*"
    r"(?:\[([^\[\]{}]*(?:\{[^{}]*\}[^\[\]{}]*)*)\]\s*)?\{([^{}]*)\}"
)
_VERBATIM_BEGIN = re.compile(r"\\begin\s*\{(verbatim\*?|Verbatim|lstlisting|minted|comment)\}")
_INLINE_VERBATIM = re.compile(
    r"\\(?:verb\*?|lstinline(?:\[[^\]]*\])?)(?:\{[^}]*\}|([^\sa-zA-Z{])(?:(?!\1).)*\1)"
)
_COMMENT = re.compile(r"(?<!\\)%")
_COMMAND_KIND: dict[str, PackageKind] = {
    "usepackage": "package",
    "usetikzlibrary": "tikzlibrary",
    "usepgfplotslibrary": "pgfplotslibrary",
}


def _split_names(argument: str) -> list[str]:
    return [item.strip() for item in argument.split(",") if item.strip()]


def _collect(entries: list[PackageEntry], code: str) -> None:
    for match in _PACKAGE_COMMAND.finditer(code):
        command, raw_options, raw_argument = match.groups()
        kind = _COMMAND_KIND[command]
        options = (raw_options or "").strip() if kind == "package" else ""
        for name in _split_names(raw_argument):
            entry = PackageEntry(kind, name, options)
            if entry not in entries:
                entries.append(entry)


def _scan_line(entries: list[PackageEntry], code: str) -> str | None:
    """Collect one line's commands outside comments and verbatim; returns an open verbatim end."""
    # Whichever comes first, a comment or a verbatim environment, ends the scannable part.
    while True:
        comment = _COMMENT.search(code)
        begin = _VERBATIM_BEGIN.search(code)
        if not begin or (comment and comment.start() < begin.start()):
            _collect(entries, code[: comment.start()] if comment else code)
            return None
        _collect(entries, code[: begin.start()])
        end = f"\\end{{{begin.group(1)}}}"
        end_at = code.find(end, begin.end())
        if end_at < 0:
            return end
        code = code[end_at + len(end):]


def exercise_entries(latex: str) -> list[PackageEntry]:
    """Package commands in exercise LaTeX, skipping comments and verbatim; one line per command."""
    entries: list[PackageEntry] = []
    verbatim_end: str | None = None
    for line in re.split(r"\r?\n", latex):
        code = _INLINE_VERBATIM.sub("", line)
        if verbatim_end:
            end_at = code.find(verbatim_end)
            if end_at < 0:
                continue
            code = code[end_at + len(verbatim_end):]
        verbatim_end = _scan_line(entries, code)
    return entries


def document_body(doc: str) -> str:
    start = doc.find("\\begin{document}")
    return doc[start:] if start >= 0 else ""


# --- Merging the levels -------------------------------------------------------------------------


def _unsupported(kind: PackageKind, name: str) -> str:
    if not NAME_PATTERN.fullmatch(name):
        return "name"
    if kind == "package":
        return FORBIDDEN_PACKAGES.get(name) or ("locked" if name in LOCKED_PACKAGES else "")
    return ""


@dataclass
class _Merged:
    kind: PackageKind
    name: str
    options: dict[str, tuple[str, SourceRef]] = field(default_factory=dict)
    sources: list[SourceRef] = field(default_factory=list)


def _dealias(entry: PackageEntry, ref: SourceRef, notes: list[PackageNote]) -> tuple[str, str]:
    """The entry's name and options after aliases (enumerate is enumitem's shortlabels option)."""
    alias = PACKAGE_ALIASES.get(entry.name) if entry.kind == "package" else None
    if alias is None:
        return entry.name, entry.options
    target, option = alias
    notes.append(PackageNote("aliased", entry.kind, entry.name, target, (ref,)))
    return target, ",".join(part for part in (option, entry.options) if part)


def _leave_out(
    merged: dict[tuple[str, str], _Merged], notes: list[PackageNote], key: tuple[str, str]
) -> None:
    """An exam's ``disabled`` entry: drop the package unless an exercise needs it."""
    current = merged.get(key)
    if current is None:
        return
    needed_by = tuple(source for source in current.sources if source.source == "exercise")
    if needed_by:
        notes.append(PackageNote("kept", current.kind, current.name, "", needed_by))
    else:
        del merged[key]


def _merge_options(
    current: _Merged, notes: list[PackageNote], options: str, ref: SourceRef
) -> None:
    for item in split_options(options):
        option_key = item.partition("=")[0]
        previous = current.options.get(option_key)
        if previous is not None and previous[0] != item:
            both_exercises = previous[1].source == "exercise" and ref.source == "exercise"
            code = "conflict" if both_exercises else "override"
            notes.append(
                PackageNote(code, current.kind, current.name, option_key, (previous[1], ref))
            )
        current.options[option_key] = (item, ref)


def _apply(
    merged: dict[tuple[str, str], _Merged],
    notes: list[PackageNote],
    entry: PackageEntry,
    ref: SourceRef,
) -> None:
    kind = entry.kind
    name, options = _dealias(entry, ref, notes)
    reason = _unsupported(kind, name)
    if reason:
        notes.append(PackageNote("ignored", kind, name, reason, (ref,)))
        return
    if entry.disabled:
        _leave_out(merged, notes, (kind, name))
        return
    current = merged.setdefault((kind, name), _Merged(kind, name))
    if ref not in current.sources:
        current.sources.append(ref)
    _merge_options(current, notes, options, ref)


def resolve_packages(layers: Iterable[PackageLayer]) -> ResolvedPackages:
    """Merge the levels in order (account, exercises, exam): later ones override option values."""
    merged: dict[tuple[str, str], _Merged] = {}
    notes: list[PackageNote] = []
    for layer in layers:
        ref = SourceRef(layer.source, layer.label)
        for entry in layer.entries:
            _apply(merged, notes, entry, ref)
    needs_pgfplots = any(m.kind == "pgfplotslibrary" for m in merged.values())
    if needs_pgfplots and ("package", "pgfplots") not in merged:
        auto = SourceRef("auto")
        merged[("package", "pgfplots")] = _Merged("package", "pgfplots", sources=[auto])
        notes.append(PackageNote("added", "package", "pgfplots", "", (auto,)))
    packages = [
        ResolvedPackage(m.kind, m.name, [item for item, _ in m.options.values()], m.sources)
        for m in merged.values()
    ]
    return ResolvedPackages(packages, notes)


_LIBRARY_COMMANDS = (("tikzlibrary", "usetikzlibrary"), ("pgfplotslibrary", "usepgfplotslibrary"))


def package_preamble(resolved: ResolvedPackages) -> str:
    """The lines before ``\\documentclass``: options first, so no later load can clash."""
    packages = [p for p in resolved.packages if p.kind == "package"]
    options = [
        f"\\PassOptionsToPackage{{{','.join(p.options)}}}{{{p.name}}}"
        for p in packages
        if p.options
    ]
    before = [f"  \\RequirePackage{{{p.name}}}%" for p in packages if p.name not in AFTER_HYPERREF]
    after = [f"  \\RequirePackage{{{p.name}}}%" for p in packages if p.name in AFTER_HYPERREF]
    for kind, command in _LIBRARY_COMMANDS:
        names = [p.name for p in resolved.packages if p.kind == kind]
        if names:
            before.append(f"  \\{command}{{{','.join(names)}}}%")
    if not (options or before or after):
        return ""
    lines = ["% LaTeX packages from the Examance settings, the exam and its exercises", *options]
    if before:
        lines += ["\\def\\ExamancePackages{%", *before, "}"]
    if after:
        lines += ["\\def\\ExamancePackagesAfterHyperref{%", *after, "}"]
    return "\n".join(lines) + "\n"


def with_packages(doc: str, layers: Sequence[PackageLayer]) -> str:
    """Write the merged packages of *layers* in front of the ``\\documentclass`` of *doc*."""
    block = package_preamble(resolve_packages(layers))
    if not block:
        return doc
    start = doc.find("\\documentclass")
    start = start if start >= 0 else 0
    return doc[:start] + block + doc[start:]
