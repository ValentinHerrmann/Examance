/**
 * Parse/build helpers for one MC question's options, matching the \LoesungMulti[N]{ \multi{wrong}
 * \Lmulti{correct} ... } macros in backend/latex-assets/sty/Loesung.sty.
 */

import { escapeLatex } from "./scoreParser";

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

const LOESUNG_MULTI_RE = /\\LoesungMulti\[(\d+)\]\{([\s\S]*)\}\s*$/;
const OPTION_RE = /\\(Lmulti|multi)\{([^}]*)\}/g;

/**
 * Splits a MC exercise's latex body into free-text question intro and
 * structured options. Returns an empty options array if no \LoesungMulti
 * block is found (e.g. a brand-new exercise).
 */
export function parseMcOptions(latexBody: string | undefined | null): McOptionsParseResult {
  const body = latexBody || "";
  const match = body.match(LOESUNG_MULTI_RE);
  if (!match) {
    return { questionText: body, options: [], columns: null };
  }

  const questionText = body.slice(0, match.index).trim();
  const storedColumns = Number(match[1]);
  const optionsBlock = match[2];
  const options: McOption[] = [];
  let optionMatch: RegExpExecArray | null;
  OPTION_RE.lastIndex = 0;
  while ((optionMatch = OPTION_RE.exec(optionsBlock)) !== null) {
    options.push({ text: optionMatch[2].trim(), correct: optionMatch[1] === "Lmulti" });
  }

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
