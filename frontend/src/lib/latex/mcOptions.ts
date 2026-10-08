/**
 * Parse/build helpers for one MC question's options, matching the \LoesungMulti[N]{ \multi{wrong}
 * \Lmulti{correct} ... } macros in backend/latex-assets/sty/Loesung.sty.
 */

import { escapeLatex, unescapeLatex } from "./scoreParser";

export interface McOption {
  text: string;
  correct: boolean;
}

/** Most options a single MC question may have. */
export const MC_MAX_OPTIONS = 26;
/** Fewest options a single MC question may have. */
export const MC_MIN_OPTIONS = 2;
/** `multicols` refuses more than 10 columns; 1 lays the options out as a plain list. */
export const MC_MAX_COLUMNS = 10;

export interface McOptionsParseResult {
  questionText: string;
  options: McOption[];
  /**
   * Explicit column count, or `null` for "auto" (one column per option, capped
   * at MC_MAX_COLUMNS). Stored only in the LaTeX body as \LoesungMulti[N].
   */
  columns: number | null;
}

// `[N]` is optional: Loesung.sty defaults \LoesungMulti to 2 columns.
const LOESUNG_MULTI_RE = /\\LoesungMulti(?:\[(\d+)\])?\s*\{([\s\S]*)\}\s*$/;
const LOESUNG_MULTI_DEFAULT_COLUMNS = 2;
// A control word ends at the first non-letter, so `\multicols` is not an option.
const OPTION_MACRO_RE = /\\(Lmulti|multi)(?![A-Za-z])/g;
// `%` up to the line end, unless escaped (an odd number of backslashes before it).
const COMMENT_RE = /(^|[^\\])((?:\\\\)*)%.*$/gm;

/** One box per `\multi`/`\Lmulti`, in printed order (the OMR counter's order). Comments print nothing. */
function scanOptions(tex: string): McOption[] {
  const source = tex.replace(COMMENT_RE, "$1$2");
  const starts = [...source.matchAll(OPTION_MACRO_RE)];
  return starts.map((m, k) => {
    const end = k + 1 < starts.length ? starts[k + 1].index : source.length;
    const text = optionText(source.slice(m.index + m[0].length, end));
    return { text: unescapeLatex(text), correct: m[1] === "Lmulti" };
  });
}

/** The `{…}` argument as the editor writes it; else the item text up to the enclosing group's end. */
function optionText(rest: string): string {
  const from = rest.length - rest.trimStart().length;
  const braced = rest[from] === "{";
  let depth = braced ? 0 : 1;
  for (let i = from; i < rest.length; i++) {
    if (rest[i] === "\\") {
      if (!braced && rest.startsWith("\\end{", i)) return rest.slice(from, i).trim();
      i++;
    } else if (rest[i] === "{") depth++;
    else if (rest[i] === "}" && --depth === 0) return rest.slice(braced ? from + 1 : from, i).trim();
  }
  return rest.slice(braced ? from + 1 : from).trim();
}

/**
 * The options a body prints, one per answer box, wherever they stand: `\OmrExercise` numbers every
 * `\multi`/`\Lmulti` of the body, so this is what the OMR template's `optionIndex` refers to.
 */
export function printedMcOptions(latexBody: string | undefined | null): McOption[] {
  return scanOptions(latexBody || "");
}

/**
 * Splits a MC exercise's latex body into free-text question intro and structured options (texts
 * unescaped, the inverse of buildMcOptionsLatex). Returns an empty options array if no
 * \LoesungMulti block is found (e.g. a brand-new exercise).
 */
export function parseMcOptions(latexBody: string | undefined | null): McOptionsParseResult {
  const body = latexBody || "";
  const match = body.match(LOESUNG_MULTI_RE);
  if (!match) {
    return { questionText: body, options: [], columns: null };
  }

  const questionText = body.slice(0, match.index).trim();
  const storedColumns = match[1] === undefined ? LOESUNG_MULTI_DEFAULT_COLUMNS : Number(match[1]);
  const options = scanOptions(match[2]);

  return { questionText, options, columns: storedColumns === autoColumns(options.length) ? null : storedColumns };
}

function clampColumns(columns: number): number {
  return Math.min(MC_MAX_COLUMNS, Math.max(1, Math.round(columns)));
}

/** The column count "auto" resolves to: one per option, within multicols' limit. */
function autoColumns(optionCount: number): number {
  return clampColumns(optionCount);
}

/**
 * Builds an MC exercise's latex body from question text and options. Text is plain input (see
 * escapeLatex in scoreParser.ts) and escaped here so a stray %/#/_/&/{/} cannot break the
 * \LoesungMulti block and the omr:// annotations OMR template capture relies on.
 */
export function buildMcOptionsLatex(
  questionText: string,
  options: McOption[],
  columns: number | null = null,
): string {
  const columnCount = columns === null ? autoColumns(options.length) : clampColumns(columns);
  const lines = options
    .map((o) => `  \\${o.correct ? "Lmulti" : "multi"}{${escapeLatex(o.text)}}`)
    .join("\n");
  return `${escapeLatex(questionText.trim())}\n\n\\LoesungMulti[${columnCount}]{\n${lines}\n}`;
}
