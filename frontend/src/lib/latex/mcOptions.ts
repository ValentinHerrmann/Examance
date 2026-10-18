/**
 * Parse/build helpers for one MC question's options, matching the \LoesungMulti[N]{ \multi{wrong}
 * \Lmulti{correct} ... } macros in backend/latex-assets/sty/Loesung.sty.
 */

import { escapeLatex, unescapeLatex } from "./scoreParser";

export interface McOption {
  /** Plain text as typed in the editor (escaped when written). */
  text: string;
  correct: boolean;
  /** LaTeX the option was read from; written back as is while `text` still matches it. */
  source?: string;
}

/** Most options a single MC question may have. */
export const MC_MAX_OPTIONS = 26;
/** Fewest options a single MC question may have. */
export const MC_MIN_OPTIONS = 2;
/** `multicols` refuses more than 10 columns; 1 lays the options out as a plain list. */
export const MC_MAX_COLUMNS = 10;

export interface McOptionsParseResult {
  /** LaTeX before the \LoesungMulti block. */
  questionText: string;
  options: McOption[];
  /** LaTeX after the block (e.g. an explanation), kept when the body is rebuilt. */
  trailingText: string;
  /**
   * Explicit column count, or `null` for "auto" (one column per option, capped
   * at MC_MAX_COLUMNS). Stored only in the LaTeX body as \LoesungMulti[N].
   */
  columns: number | null;
}

// `[N]` is optional: Loesung.sty defaults \LoesungMulti to 2 columns.
const LOESUNG_MULTI_START_RE = /\\LoesungMulti(?:\[(\d+)\])?\s*\{/;
const LOESUNG_MULTI_DEFAULT_COLUMNS = 2;
// A control word ends at the first non-letter, so `\multicols` is not an option.
const OPTION_MACRO_RE = /\\(Lmulti|multi)(?![A-Za-z])/g;
// `%` up to the line end, unless escaped (an odd number of backslashes before it).
const COMMENT_RE = /(^|[^\\])((?:\\\\)*)%.*$/gm;

/** One box per `\multi`/`\Lmulti`, in printed order (the OMR counter's order). Comments print nothing. */
function scanOptions(tex: string): Required<McOption>[] {
  const source = tex.replace(COMMENT_RE, "$1$2");
  const starts = [...source.matchAll(OPTION_MACRO_RE)];
  return starts.map((m, k) => {
    const end = k + 1 < starts.length ? starts[k + 1].index : source.length;
    const text = optionText(source.slice(m.index + m[0].length, end));
    return { text: unescapeLatex(text), correct: m[1] === "Lmulti", source: text };
  });
}

/**
 * `\multi` takes no argument: its item text runs to the next option (already cut off), an
 * unmatched `\end{` or the enclosing group's end. A leading `{…}` is only a TeX group.
 */
function optionText(rest: string): string {
  let depth = 0;
  let envs = 0;
  let end = rest.length;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "\\") {
      if (depth === 0 && rest.startsWith("\\begin{", i)) envs++;
      else if (depth === 0 && rest.startsWith("\\end{", i) && envs-- === 0) {
        end = i;
        break;
      }
      i++;
    } else if (rest[i] === "{") depth++;
    else if (rest[i] === "}" && --depth < 0) {
      end = i;
      break;
    }
  }
  return unwrapLeadingGroup(rest.slice(0, end).trim());
}

/** A group prints its content: `{a}` → "a" (the editor's form), `{A} (2 P.)` → "A (2 P.)", `{} Ja` → "Ja". */
function unwrapLeadingGroup(text: string): string {
  if (text[0] !== "{") return text;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return (text.slice(1, i) + text.slice(i + 1)).trim();
  }
  return text;
}

/**
 * The options a body prints, one per answer box, wherever they stand: `\OmrExercise` numbers every
 * `\multi`/`\Lmulti` of the body, so this is what the OMR template's `optionIndex` refers to.
 */
export function printedMcOptions(latexBody: string | undefined | null): McOption[] {
  return scanOptions(latexBody || "").map(({ text, correct }) => ({ text, correct }));
}

/**
 * Splits a MC exercise's latex body into the question (LaTeX, as written) and structured options
 * (texts unescaped, sources kept), the inverse of buildMcOptionsLatex. Returns an empty options
 * array if no \LoesungMulti block is found (e.g. a brand-new exercise).
 */
export function parseMcOptions(latexBody: string | undefined | null): McOptionsParseResult {
  const body = latexBody || "";
  // Comments are blanked, not removed, so offsets in `masked` match `body`.
  const masked = body.replace(COMMENT_RE, (m: string, pre: string, slashes: string) =>
    pre + slashes + " ".repeat(m.length - pre.length - slashes.length));
  const match = LOESUNG_MULTI_START_RE.exec(masked);
  const open = match ? match.index + match[0].length - 1 : -1;
  const close = open === -1 ? -1 : closingBrace(masked, open);
  if (!match || close === -1) {
    return { questionText: body, options: [], trailingText: "", columns: null };
  }

  const questionText = body.slice(0, match.index).trim();
  const storedColumns = match[1] === undefined ? LOESUNG_MULTI_DEFAULT_COLUMNS : Number(match[1]);
  const options = scanOptions(body.slice(open + 1, close));
  const trailingText = body.slice(close + 1).trim();

  return { questionText, options, trailingText, columns: storedColumns === autoColumns(options.length) ? null : storedColumns };
}

/** Index of the `}` closing the group opened at `open`, or -1 when it is never closed. */
function closingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

function clampColumns(columns: number): number {
  return Math.min(MC_MAX_COLUMNS, Math.max(1, Math.round(columns)));
}

/** The column count "auto" resolves to: one per option, within multicols' limit. */
function autoColumns(optionCount: number): number {
  return clampColumns(optionCount);
}

/** An option's LaTeX: its parsed source while the text is unchanged, else the escaped text. */
function optionLatex(o: McOption): string {
  return o.source !== undefined && unescapeLatex(o.source) === o.text ? o.source : escapeLatex(o.text);
}

/**
 * Builds an MC exercise's latex body. The question is LaTeX (edited in a LaTeX editor) and written
 * as is: escaping it again on every rebuild corrupted it. Option texts are plain input, escaped so
 * a stray %/#/_/&/{/} cannot break the \LoesungMulti block the OMR template capture relies on.
 */
export function buildMcOptionsLatex(
  questionText: string,
  options: McOption[],
  columns: number | null = null,
  trailingText = "",
): string {
  const columnCount = columns === null ? autoColumns(options.length) : clampColumns(columns);
  const lines = options
    .map((o) => `  \\${o.correct ? "Lmulti" : "multi"}{${optionLatex(o)}}`)
    .join("\n");
  const trailing = trailingText.trim() ? `\n${trailingText.trim()}` : "";
  return `${questionText.trim()}\n\n\\LoesungMulti[${columnCount}]{\n${lines}\n}${trailing}`;
}
