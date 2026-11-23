# LaTeX packages (issue #108)

Teachers add LaTeX packages and TikZ/pgfplots libraries to the exam template without touching the
template. The rule tables (limits, name pattern, forbidden, locked, aliases, after-hyperref) live once in
`backend/app/services/latex_package_rules.json`, read by both `frontend/src/lib/latex/packages.ts` (Vite JSON import)
and `backend/app/services/latex_packages.py`; the merge logic exists on both sides and must give the same output.

## Levels

| Level | Stored in | Edited in |
|---|---|---|
| Template | `backend/latex-assets/sty/*.sty` | read-only overview (`GET /latex/template-packages`, parsed from the files) |
| Account | `teachers.latex_packages` (JSON), `teachers.latex_all_subject_packages` (bool) | Settings → "LaTeX-Pakete" (`AccountPackagesCard`; `GET`/`PUT /user/latex-packages`) |
| Exercise | `\usepackage` / `\usetikzlibrary` / `\usepgfplotslibrary` lines in the exercise LaTeX | exercise editor, `ExercisePackagesPanel` (it rewrites only lines that hold nothing but package commands) |

The packages the editor's subject snippets use (struktex, listings, svg, chemfig, circuitikz, mhchem, tikz-uml,
custom-pgf-umlcd; issues #154, #341) are **lazy**: `packages.sty` no longer loads them, the merger adds one when the
document contains one of its triggers, so a snippet never needs a package line and a document without them compiles
faster (see "Lazy subject packages"). The template itself needs none of them: `Loesung.sty` guards its `\lstset` with
`\ifdefined\lstset`, and `packages.sty` defines the UML colours (`\umltextcolor` and friends) that `Loesung.sty` recolours,
which `custom-pgf-umlcd.sty` only `\providecommand`s. The browser engine's TeX Live bundle lacks some of them; those are vendored
unmodified in `backend/latex-assets/sty/` (mhchem, chemgreek, simplekv for chemfig, like bbding, pifont, struktex; the
browser worker exposes `sty/*.sty` and `sty/*.tex` flat), while Tectonic takes flat names from its own TeX Live 2022
bundle. Check a new template package in both engines: a dependency missing from the browser bundle breaks every compile.

Exercise packages stay in the LaTeX on purpose: they then travel with sharing, copies, versions,
variants, merges, archives and exports without a second field to keep in sync.

An entry is `{kind, name, options}`. Exams have no package list of their own (dropped in issue #272): stored exam
values and a legacy `disabled` key in an entry are ignored.

## Merging

`resolvePackages(layers)` walks account → exercises (in exam order) and merges per
`(kind, name)`:

- Options are split at top-level commas. Flags are united; `key=value` items are keyed by `key`,
  and a later level overrides an earlier one (note `override`). Two exercises with different
  values for the same key are a real clash in one document: the later wins, note `conflict`.
- Unsupported packages are dropped with note `ignored` (detail = reason): `inputenc`/`fontenc`
  (pdfLaTeX only; under XeLaTeX `fontenc` would replace the exam font), `paralist` (clashes with
  enumitem), and template packages whose options are fixed: `geometry` (page layout the OMR
  template relies on), `hyperref` (`hidelinks` keeps the OMR link annotations invisible),
  `eso-pic` (fiducials). The settings refuse those entries (`422`); in exercise LaTeX they are
  skipped.
- Aliases: `enumerate` becomes enumitem's `shortlabels` option (note `aliased`), so pasted
  `\begin{enumerate}[a)]` keeps working.
- A pgfplots library without `pgfplots` adds the package (note `added`).

## Lazy subject packages (issue #341)

`latex_package_rules.json` holds a `lazy` list in load order: `{name, options, triggers}` (`options` fixed, e.g. mhchem
`version=4`; `name` may carry a path, `sty/tikz-uml`). After the levels are merged, `resolvePackages(layers, document,
allSubject)` adds every lazy package whose literal trigger text occurs anywhere in the document (commands and
environment names such as `\ce{`, `\begin{lstlisting}`, `\uml`, `\begin{class}`; a trigger in a comment only loads a
package too much), with note `added` and detail `used`; `allSubject` adds all of them (detail `all`). A lazy package
a level already names keeps that level's options; the fixed ones only fill missing keys. Naming a lazy package in the
account list or an exercise therefore loads it always.

The account switch `teachers.latex_all_subject_packages` ("Always load all subject packages", `GET`/`PUT
/user/latex-packages`, field `all_subject_packages`; `null` on a PUT keeps it) turns `allSubject` on. The frontend keeps
it next to the account list (`packageSettings.ts` calls `setAllSubjectPackages`), and `withPackages` reads it; the
server wrapper in `latex.py` has no account and loads by triggers only. `GET /latex/template-packages` lists the lazy
packages with `lazy: true`. A new subject snippet needs its commands in `triggers` (`tests/latexPackages.test.ts`
checks the palette) and the package in `backend/latex-warmup/warmup.tex`, which loads all of them through
`\ExamancePackages` so Tectonic's cache stays warm. `backend/tests/fixtures/latex_package_blocks.json` is the shared
fixture both mergers must reproduce.

## Emission

`withPackages(doc, layers)` writes one block in front of `\documentclass`:

```latex
\PassOptionsToPackage{dvipsnames,table}{xcolor}
\def\ExamancePackages{%
  \RequirePackage{xcolor}%
  \RequirePackage{pgfplots}%
  \usetikzlibrary{mindmap}%
  \usepgfplotslibrary{fillbetween}%
}
\def\ExamancePackagesAfterHyperref{%
  \RequirePackage{cleveref}%
}
```

- Options only ever go through `\PassOptionsToPackage` before `\documentclass`. A package the
  template loads itself therefore gets them at its first load, and the later `\RequirePackage`
  without options is a no-op: no option clash is possible.
- `packages.sty` runs `\ExamancePackages` after its own packages and before eso-pic/hyperref, which
  must stay last for the OMR links; `\ExamancePackagesAfterHyperref` runs after hyperref for the
  few packages that require it (`cleveref`, `bookmark`, `hypcap`, `glossaries`).
- In the document body `Schulaufgabe.sty` turns `\usepackage` of a loaded package into a no-op, so
  the exercise lines stay where the teacher wrote them. A package that was not loaded (a command
  split over lines) fails with a clear error.

Every document builder goes through this: `buildExamLatex`, the new-exam draft, exercise previews
and the group export (`buildExerciseDocument`), and on the server the snippet wrapper of
`compile_latex`. The frontend fetches the account list once per session
(`getAccountPackages()`, cleared with the compile cache); the server reads the column.

## Validation

Names match `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`. Options typed in the settings are declarative:
at most 300 characters, no `\ % # [ ]` or line breaks, balanced braces. At most 50 entries per
level, no `(kind, name)` twice. Exercise LaTeX is not restricted beyond the name pattern (it is
compiled as written anyway).
