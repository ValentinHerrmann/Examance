/**
 * Packages and TikZ libraries an exercise loads in its own LaTeX (issue #108). The compile copies those commands into
 * the preamble; in the body Schulaufgabe.sty turns `\usepackage` of a loaded package into a no-op. Mirrors
 * backend/app/services/latex_preamble.py; keep the two in sync.
 */

const PACKAGE_COMMAND =
  /\\(usepackage|usetikzlibrary|usepgfplotslibrary)\s*(?:\[((?:[^[\]{}]|\{[^{}]*\})*)\])?\s*\{([^{}]*)\}/g;
const VERBATIM_BEGIN = /\\begin\s*\{(verbatim\*?|Verbatim|lstlisting|minted|comment)\}/;
const INLINE_VERBATIM = /\\(?:verb\*?|lstinline(?:\[[^\]]*\])?)(?:\{[^}]*\}|([^\sa-zA-Z{])(?:(?!\1).)*\1)/g;
const COMMENT = /(?<!\\)%/;
/** pdfLaTeX-only boilerplate of pasted documents; under XeLaTeX fontenc would even replace the exam font. */
const SKIPPED_PACKAGES = new Set(["inputenc", "fontenc"]);

export interface ExercisePreamble {
  /** `\PassOptionsToPackage` lines, for before `\documentclass`, so packages the template loads get the options too. */
  options: string[];
  /** `\usepackage` / `\usetikzlibrary` / `\usepgfplotslibrary` lines, for before `\begin{document}`. */
  packages: string[];
}

/** Collects the package commands of `latex`, skipping comments and verbatim; each command must stay on one line. */
export function exercisePreamble(latex: string): ExercisePreamble {
  const options = new Set<string>();
  const packages = new Set<string>();
  const collect = (code: string) => {
    for (const [, command, rawOptions, rawArgument] of code.matchAll(PACKAGE_COMMAND)) {
      const opts = rawOptions?.trim() ?? "";
      if (command !== "usepackage") {
        const libraries = splitList(rawArgument);
        if (libraries.length) packages.add(`\\${command}{${libraries.join(",")}}`);
        continue;
      }
      const names = splitList(rawArgument).filter((name) => !SKIPPED_PACKAGES.has(name));
      if (!names.length) continue;
      if (opts) options.add(`\\PassOptionsToPackage{${opts}}{${names.join(",")}}`);
      packages.add(`\\usepackage${opts ? `[${opts}]` : ""}{${names.join(",")}}`);
    }
  };

  let verbatimEnd: string | null = null;
  for (const line of latex.split(/\r?\n/)) {
    let code = line.replace(INLINE_VERBATIM, "");
    if (verbatimEnd) {
      const endAt = code.indexOf(verbatimEnd);
      if (endAt < 0) continue;
      code = code.slice(endAt + verbatimEnd.length);
      verbatimEnd = null;
    }
    // Walk the line: whichever comes first, a comment or a verbatim environment, ends the scannable part.
    for (;;) {
      const comment = COMMENT.exec(code);
      const begin = VERBATIM_BEGIN.exec(code);
      if (!begin || (comment && comment.index < begin.index)) {
        collect(comment ? code.slice(0, comment.index) : code);
        break;
      }
      collect(code.slice(0, begin.index));
      const end = `\\end{${begin[1]}}`;
      const endAt = code.indexOf(end, begin.index + begin[0].length);
      if (endAt < 0) {
        verbatimEnd = end;
        break;
      }
      code = code.slice(endAt + end.length);
    }
  }
  return { options: [...options], packages: [...packages] };
}

function splitList(argument: string): string[] {
  return argument
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Adds the package commands found in `source` (default: everything after `\begin{document}`) to the preamble of
 * `doc`. Callers whose exercises are `\input` from separate files pass their bodies as `source`.
 */
export function withExercisePreamble(doc: string, source?: string): string {
  const bodyStart = doc.indexOf("\\begin{document}");
  if (bodyStart < 0) return doc;
  const { options, packages } = exercisePreamble(source ?? doc.slice(bodyStart));
  if (!options.length && !packages.length) return doc;
  const found = doc.indexOf("\\documentclass");
  const classStart = found >= 0 && found < bodyStart ? found : 0;
  const optionBlock = options.map((line) => `${line}\n`).join("");
  const packageBlock = packages.map((line) => `${line}\n`).join("");
  return (
    doc.slice(0, classStart) +
    optionBlock +
    doc.slice(classStart, bodyStart) +
    packageBlock +
    doc.slice(bodyStart)
  );
}
