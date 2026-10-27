/**
 * Maps TeX line numbers of an assembled document back to the exercise the user edited (issue #166).
 * Builders wrap each user-authored body in marker comment lines (`markSource`); `extractSourceMap`
 * removes them again, so the engines and every exported file see exactly the unmarked document.
 */

const BEGIN = "%%@examance-src:";
const END = "%%@examance-end";

export interface SourceRange {
  label: string;
  /** First and last line (1-based) of the body in the stripped document. */
  start: number;
  end: number;
}

export interface SourceMap {
  /** The document without marker lines; this is what gets compiled or exported. */
  tex: string;
  ranges: SourceRange[];
}

export interface SourceLocation {
  /** The exercise, or null for the generated template around it. */
  label: string | null;
  line: number;
}

/**
 * `body` between marker lines. Must start at the beginning of a line; an empty body stays unmarked
 * because the marked form would leave a blank line (a paragraph break) once stripped.
 */
export function markSource(body: string, label: string): string {
  if (!body) return body;
  const clean = label.replace(/\s+/g, " ").trim() || "?";
  return `${BEGIN}${clean}\n${body}${body.endsWith("\n") ? "" : "\n"}${END}`;
}

/** Removes the marker lines and records where each marked body ended up. */
export function extractSourceMap(marked: string): SourceMap {
  if (!marked.includes(BEGIN)) return { tex: marked, ranges: [] };
  const out: string[] = [];
  const ranges: SourceRange[] = [];
  let open: { label: string; start: number } | null = null;
  for (const line of marked.split("\n")) {
    if (line.startsWith(BEGIN)) {
      open = { label: line.slice(BEGIN.length), start: out.length + 1 };
    } else if (line === END) {
      if (open) ranges.push({ ...open, end: out.length });
      open = null;
    } else {
      out.push(line);
    }
  }
  return { tex: out.join("\n"), ranges };
}

/** The document without markers (exports, layout reports). */
export function stripSourceMarkers(tex: string): string {
  return extractSourceMap(tex).tex;
}

/**
 * Where line `line` of the compiled document came from. With `echoed` (the text TeX printed after
 * `l.<n>`), a line whose source does not contain it is rejected: the error was inside a package file.
 */
export function mapLine(map: SourceMap, line: number, echoed?: string): SourceLocation | null {
  if (echoed !== undefined) {
    const source = map.tex.split("\n")[line - 1];
    const probe = echoed.trim().slice(-40);
    if (source === undefined || (probe && !source.includes(probe))) return null;
  }
  const range = map.ranges.find((r) => line >= r.start && line <= r.end);
  return range ? { label: range.label, line: line - range.start + 1 } : { label: null, line };
}

/** Appends the mapped location to each `l.<n>` context line of the log. */
export function annotateLog(log: string, map: SourceMap, describe: (loc: SourceLocation) => string): string {
  if (map.ranges.length === 0) return log;
  return log.replace(/^l\.(\d+) (.*)$/gm, (whole, n: string, echoed: string) => {
    const loc = mapLine(map, Number(n), echoed);
    return loc?.label ? `${whole}    [${describe(loc)}]` : whole;
  });
}
