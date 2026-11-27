/** Maps TeX line numbers of an assembled document back to the exercise the user edited (issue #166). Builders wrap each user-authored body in marker comment lines (`markSource`); `extractSourceMap` removes them again, so the engines and every exported file see exactly the unmarked document. */

const BEGIN = "%%@examance-src:";
const END = "%%@examance-end";

export interface SourceRange {
  /** The exercise's display name. */
  label: string;
  /** The exercise's id, or null when the builder marked without one. */
  exerciseId: string | null;
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
  /** The exercise's display name, or null for the generated template around it. */
  label: string | null;
  exerciseId: string | null;
  line: number;
}

/** `body` between markers labelled `<exerciseId>|<name>` (ids keep two exercises of the same name apart); `extractSourceMap` removes exactly the inserted `BEGIN…\n` and `\nEND`, whatever surrounds them. Must start at the beginning of a line. */
export function markSource(body: string, name: string, exerciseId?: string | null): string {
  const clean = name.replace(/\s+/g, " ").trim() || "?";
  const id = (exerciseId ?? "").replace(/[|\s]/g, "");
  return `${BEGIN}${id}|${clean}\n${body}\n${END}`;
}

function parseLabel(raw: string): { label: string; exerciseId: string | null } {
  const bar = raw.indexOf("|");
  if (bar < 0) return { label: raw, exerciseId: null };
  return { label: raw.slice(bar + 1), exerciseId: raw.slice(0, bar) || null };
}

const MARKER = /(?:^%%@examance-src:([^\n]*)\n)|(?:\n%%@examance-end)/gm;

/** Removes the markers and records where each marked body ended up. */
export function extractSourceMap(marked: string): SourceMap {
  if (!marked.includes(BEGIN)) return { tex: marked, ranges: [] };
  let tex = "";
  let lines = 1;
  let last = 0;
  const ranges: SourceRange[] = [];
  let open: Omit<SourceRange, "end"> | null = null;
  for (const m of marked.matchAll(MARKER)) {
    const slice = marked.slice(last, m.index);
    tex += slice;
    lines += slice.split("\n").length - 1;
    last = m.index + m[0].length;
    if (m[1] === undefined) {
      if (open) ranges.push({ ...open, end: lines });
      open = null;
    } else {
      open = { ...parseLabel(m[1]), start: lines };
    }
  }
  return { tex: tex + marked.slice(last), ranges };
}

/** The document without markers (exports, layout reports). */
export function stripSourceMarkers(tex: string): string {
  return extractSourceMap(tex).tex;
}

/** Where line `line` of the compiled document came from. With `echoed` (the text TeX printed after `l.<n>`), a line whose source does not contain it is rejected: the error was inside a package file. */
export function mapLine(map: SourceMap, line: number, echoed?: string): SourceLocation | null {
  if (echoed !== undefined) {
    const source = map.tex.split("\n")[line - 1];
    const probe = echoed.trim().slice(-40);
    if (source === undefined || (probe && !source.includes(probe))) return null;
  }
  const range = map.ranges.find((r) => line >= r.start && line <= r.end);
  return range ? { label: range.label, exerciseId: range.exerciseId, line: line - range.start + 1 } : { label: null, exerciseId: null, line };
}

/** Appends the mapped location to each `l.<n>` context line of the log. */
export function annotateLog(log: string, map: SourceMap, describe: (loc: SourceLocation) => string): string {
  if (map.ranges.length === 0) return log;
  return log.replace(/^l\.(\d+) (.*)$/gm, (whole, n: string, echoed: string) => {
    const loc = mapLine(map, Number(n), echoed);
    return loc?.label ? `${whole}    [${describe(loc)}]` : whole;
  });
}
