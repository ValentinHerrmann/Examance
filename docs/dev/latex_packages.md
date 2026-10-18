# LaTeX packages (issue #108)

Teachers add LaTeX packages and TikZ/pgfplots libraries to the exam template without touching the
template. The rules live twice, in `frontend/src/lib/latex/packages.ts` and
`backend/app/services/latex_packages.py`; keep the two in sync (same constants, same output).

## Levels

| Level | Stored in | Edited in |
|---|---|---|
| Template | `backend/latex-assets/sty/*.sty` | read-only overview (`GET /latex/template-packages`, parsed from the files) |
| Account | `teachers.latex_packages` (JSON) | Settings → "LaTeX-Pakete" (`AccountPackagesCard`; `GET`/`PUT /user/latex-packages`) |
| Exercise | `\usepackage` / `\usetikzlibrary` / `\usepgfplotslibrary` lines in the exercise LaTeX | exercise editor, `ExercisePackagesPanel` (it rewrites only lines that hold nothing but package commands) |
| Exam | `exams.latex_packages` (JSON, null follows the account) | "Prüfung bearbeiten" dialog (`ExamPackagesField` in `ExamMetadataEditor`) |

Exercise packages stay in the LaTeX on purpose: they then travel with sharing, copies, versions,
variants, merges, archives and exports without a second field to keep in sync.

An entry is `{kind, name, options, disabled}`. `disabled` only means something on the exam level:
it leaves out a package the account adds (not one an exercise needs; that one is kept with a note).

## Merging

`resolvePackages(layers)` walks account → exercises (in exam order) → exam and merges per
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
and the group export (`buildExerciseDocument`), and on the server `compile_exam_latex` and the
snippet wrapper of `compile_latex`. The frontend fetches the account list once per session
(`getAccountPackages()`, cleared with the compile cache); the server reads the column.

## Validation

Names match `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`. Options typed in the settings are declarative:
at most 300 characters, no `\ % # [ ]` or line breaks, balanced braces. At most 50 entries per
level, no `(kind, name)` twice. Exercise LaTeX is not restricted beyond the name pattern (it is
compiled as written anyway).
