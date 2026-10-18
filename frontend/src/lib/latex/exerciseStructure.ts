/**
 * Reads and edits an exercise's structure from its LaTeX (issues #77-#79): score units, fixed
 * scores, part exercises (`Teilaufgabe`), Anforderungsbereich (`\AFB`) and competencies
 * (`\Kompetenz`). The LaTeX stays the single source of truth; macros live in Schulaufgabe.sty.
 */

export const REQUIREMENT_LEVELS = ["I", "II", "III"] as const;
export type RequirementLevel = (typeof REQUIREMENT_LEVELS)[number];

export interface ScoreUnits {
  /** `\BE` (1 point each). */
  full: number;
  /** `\hBE` (0.5 points each). */
  half: number;
  /** `\qBE` (0.25 points each). */
  quarter: number;
  /** `\Lmulti` (1 point per correct MC option). */
  mc: number;
}

interface Scored {
  /** Effective score: the fixed one if set, else the counted units. */
  score: number;
  /** Score counted from the units alone. */
  counted: number;
  /** Fixed score (`[N]` option or `\FestePunkte{N}`), null when counted. */
  fixed: number | null;
  units: ScoreUnits;
  levels: string[];
  competencies: string[];
}

export interface ExercisePart extends Scored {
  /** a, b, c, ... (matches `\alph` in Schulaufgabe.sty). */
  label: string;
  title: string;
}

export interface ExerciseStructure extends Scored {
  parts: ExercisePart[];
}

interface PartRange {
  /** Start of `\begin{Teilaufgabe}`. */
  start: number;
  /** Start of the `[N]` option (including the bracket), or -1. */
  optionStart: number;
  optionEnd: number;
  option: string | null;
  title: string;
  /** First character of the body (after the title and one newline). */
  innerStart: number;
  /** Start of `\end{Teilaufgabe}` (or the end of the text when missing). */
  innerEnd: number;
  /** End of `\end{Teilaufgabe}`. */
  end: number;
}

/** Replaces `%` comments (not `\%`) with spaces so offsets stay valid and commented macros don't count. */
function maskComments(latex: string): string {
  return latex.replace(/(^|[^\\])%[^\n]*/g, (m, pre: string) => pre + " ".repeat(m.length - pre.length));
}

/** Index just past the brace group opening at `open` (which must be `{`), or -1 when unbalanced. */
function matchBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function findParts(masked: string): PartRange[] {
  const parts: PartRange[] = [];
  const begin = /\\begin\{Teilaufgabe\}/g;
  let m: RegExpExecArray | null;
  while ((m = begin.exec(masked))) {
    const start = m.index;
    let pos = start + m[0].length;
    let optionStart = -1;
    let optionEnd = -1;
    let option: string | null = null;
    if (masked[pos] === "[") {
      const close = masked.indexOf("]", pos);
      if (close !== -1) {
        optionStart = pos;
        optionEnd = close + 1;
        option = masked.slice(pos + 1, close);
        pos = close + 1;
      }
    }
    let title = "";
    if (masked[pos] === "{") {
      const close = matchBrace(masked, pos);
      if (close !== -1) {
        title = masked.slice(pos + 1, close - 1);
        pos = close;
      }
    }
    const innerStart = masked[pos] === "\n" ? pos + 1 : pos;
    const endIdx = masked.indexOf("\\end{Teilaufgabe}", innerStart);
    const innerEnd = endIdx === -1 ? masked.length : endIdx;
    const end = endIdx === -1 ? masked.length : endIdx + "\\end{Teilaufgabe}".length;
    parts.push({ start, optionStart, optionEnd, option, title: title.trim(), innerStart, innerEnd, end });
    begin.lastIndex = end;
  }
  return parts;
}

function count(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

function countUnits(text: string): ScoreUnits {
  return {
    full: count(text, /\\BE\b/g),
    half: count(text, /\\hBE\b/g),
    quarter: count(text, /\\qBE\b/g),
    mc: count(text, /\\Lmulti\b/g)
  };
}

function unitScore(u: ScoreUnits): number {
  return u.full + u.mc + u.half * 0.5 + u.quarter * 0.25;
}

/** Brace arguments of every `\name{...}` in `text`. */
function macroArgs(text: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`\\\\${name}\\s*\\{`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1;
    const close = matchBrace(text, open);
    if (close === -1) break;
    out.push(text.slice(open + 1, close - 1).trim());
    re.lastIndex = close;
  }
  return out;
}

function parseNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const n = parseFloat(raw.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** The text outside every part range (parts replaced by spaces, offsets kept). */
function topLevelText(masked: string, parts: PartRange[]): string {
  let out = masked;
  for (const p of parts) out = out.slice(0, p.start) + " ".repeat(p.end - p.start) + out.slice(p.end);
  return out;
}

function aufgabeOption(masked: string): { start: number; end: number; value: string } | null {
  const m = /\\begin\{Aufgabe\}\[([^\]]*)\]/.exec(masked);
  if (!m) return null;
  const start = m.index + "\\begin{Aufgabe}".length;
  return { start, end: start + m[1].length + 2, value: m[1] };
}

function scored(units: ScoreUnits, fixed: number | null, levels: string[], competencies: string[], partsCounted?: number): Scored {
  const counted = partsCounted ?? unitScore(units);
  return { score: fixed ?? counted, counted, fixed, units, levels, competencies };
}

export function parseExerciseStructure(latex: string | null | undefined): ExerciseStructure {
  const masked = maskComments(latex || "");
  const ranges = findParts(masked);
  const parts: ExercisePart[] = ranges.map((r, i) => {
    const inner = masked.slice(r.innerStart, r.innerEnd);
    const fixedArgs = macroArgs(inner, "FestePunkte");
    const fixed = parseNumber(r.option) ?? parseNumber(fixedArgs[fixedArgs.length - 1]);
    return {
      label: String.fromCharCode(97 + (i % 26)),
      title: r.title,
      ...scored(countUnits(inner), fixed, macroArgs(inner, "AFB"), macroArgs(inner, "Kompetenz"))
    };
  });

  const top = topLevelText(masked, ranges);
  const topUnits = countUnits(top);
  const units: ScoreUnits = { ...topUnits };
  for (const p of parts) {
    units.full += p.units.full;
    units.half += p.units.half;
    units.quarter += p.units.quarter;
    units.mc += p.units.mc;
  }
  // A part's fixed score replaces its own units in the exercise total, as in Schulaufgabe.sty.
  const counted = unitScore(topUnits) + parts.reduce((s, p) => s + p.score, 0);
  const topFixedArgs = macroArgs(top, "FestePunkte");
  const fixed = parseNumber(aufgabeOption(masked)?.value) ?? parseNumber(topFixedArgs[topFixedArgs.length - 1]);
  return {
    ...scored(units, fixed, macroArgs(top, "AFB"), macroArgs(top, "Kompetenz"), counted),
    parts
  };
}

// ---------------------------------------------------------------------------
// Editing helpers: each returns the new LaTeX, touching only the macros it owns.
// ---------------------------------------------------------------------------

/** Removes every `\name{...}` (plus one trailing newline) inside the given ranges. */
function removeMacro(latex: string, name: string, ranges: Array<[number, number]>): string {
  const masked = maskComments(latex);
  const cuts: Array<[number, number]> = [];
  const re = new RegExp(`\\\\${name}\\s*\\{`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    const close = matchBrace(masked, m.index + m[0].length - 1);
    if (close === -1) break;
    re.lastIndex = close;
    if (!ranges.some(([s, e]) => m!.index >= s && close <= e)) continue;
    let end = close;
    while (masked[end] === " " || masked[end] === "\t") end++;
    if (masked[end] === "\n") end++;
    cuts.push([m.index, end]);
  }
  let out = latex;
  for (const [s, e] of cuts.reverse()) out = out.slice(0, s) + out.slice(e);
  return out;
}

function topRanges(latex: string): Array<[number, number]> {
  const parts = findParts(maskComments(latex));
  const ranges: Array<[number, number]> = [];
  let pos = 0;
  for (const p of parts) {
    ranges.push([pos, p.start]);
    pos = p.end;
  }
  ranges.push([pos, latex.length]);
  return ranges;
}

/** Where exercise-level macros go: after `\begin{Aufgabe}[..]{title}` if present, else the start. */
function topInsertionPoint(latex: string): number {
  const masked = maskComments(latex);
  const m = /\\begin\{Aufgabe\}(\[[^\]]*\])?/.exec(masked);
  if (!m) return 0;
  let pos = m.index + m[0].length;
  if (masked[pos] === "{") {
    const close = matchBrace(masked, pos);
    if (close !== -1) pos = close;
  }
  return masked[pos] === "\n" ? pos + 1 : pos;
}

function scope(latex: string, partIndex: number | null): { ranges: Array<[number, number]>; insertAt: (text: string) => number } {
  if (partIndex == null) return { ranges: topRanges(latex), insertAt: topInsertionPoint };
  const part = findParts(maskComments(latex))[partIndex];
  if (!part) throw new Error(`No Teilaufgabe ${partIndex}`);
  return {
    ranges: [[part.innerStart, part.innerEnd]],
    insertAt: (text) => findParts(maskComments(text))[partIndex]!.innerStart
  };
}

function insertLines(latex: string, at: number, lines: string[]): string {
  if (lines.length === 0) return latex;
  let block = lines.join("\n") + "\n";
  // `\begin{Aufgabe}{x} text` keeps its text on the same line: start the macros on a new one.
  if (at > 0 && latex[at - 1] !== "\n") block = "\n" + block;
  return latex.slice(0, at) + block + latex.slice(at);
}

function setMacroValues(latex: string, name: string, values: string[], partIndex: number | null): string {
  const removed = removeMacro(latex, name, scope(latex, partIndex).ranges);
  const at = scope(removed, partIndex).insertAt(removed);
  return insertLines(removed, at, values.map((v) => `\\${name}{${v}}`));
}

/** Sets (or with null removes) the Anforderungsbereich of the exercise or of one part. */
export function setRequirementLevel(latex: string, level: string | null, partIndex: number | null = null): string {
  return setMacroValues(latex, "AFB", level ? [level] : [], partIndex);
}

/** Replaces the competencies of the exercise or of one part. */
export function setCompetencies(latex: string, competencies: string[], partIndex: number | null = null): string {
  const clean = competencies.map((c) => c.trim()).filter((c) => c.length > 0);
  return setMacroValues(latex, "Kompetenz", clean, partIndex);
}

function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * Sets (or with null removes) a fixed score for the exercise or one part. An existing `[N]`
 * environment option is updated in place (or dropped) so the source never carries two fixed scores.
 */
export function setFixedScore(latex: string, score: number | null, partIndex: number | null = null): string {
  const masked = maskComments(latex);
  if (partIndex == null) {
    const opt = aufgabeOption(masked);
    if (opt) {
      const cleared = removeMacro(latex, "FestePunkte", topRanges(latex));
      const o = aufgabeOption(maskComments(cleared))!;
      return cleared.slice(0, o.start) + (score == null ? "" : `[${formatNumber(score)}]`) + cleared.slice(o.end);
    }
  } else {
    const part = findParts(masked)[partIndex];
    if (part && part.optionStart !== -1) {
      const cleared = removeMacro(latex, "FestePunkte", [[part.innerStart, part.innerEnd]]);
      const p = findParts(maskComments(cleared))[partIndex]!;
      return cleared.slice(0, p.optionStart) + (score == null ? "" : `[${formatNumber(score)}]`) + cleared.slice(p.optionEnd);
    }
  }
  return setMacroValues(latex, "FestePunkte", score == null ? [] : [formatNumber(score)], partIndex);
}

/** Snippet for a new part exercise (editor button and quick insert). */
export function partSnippet(title: string): string {
  return `\\begin{Teilaufgabe}{${title}}\n\n\\end{Teilaufgabe}`;
}

/**
 * Appends a part at the end of the exercise body (before `\end{Aufgabe}` when present). A body
 * without parts keeps its text as the introduction above the first part.
 */
export function appendPart(latex: string, title: string): string {
  const masked = maskComments(latex);
  const endIdx = masked.lastIndexOf("\\end{Aufgabe}");
  const at = endIdx === -1 ? latex.length : endIdx;
  const before = latex.slice(0, at).replace(/\s+$/, "");
  const after = latex.slice(at);
  const sep = before.length > 0 ? "\n" : "";
  return `${before}${sep}${partSnippet(title)}\n${after}`;
}
