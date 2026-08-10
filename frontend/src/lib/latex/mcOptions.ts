/**
 * Parse/build helpers for a single MC question's structured options.
 *
 * Matches the \LoesungMulti[N]{ \multi{wrong} \Lmulti{correct} ... } macro set
 * defined in backend/latex-assets/sty/Loesung.sty — \multi marks a distractor,
 * \Lmulti marks a correct option.
 */

export interface McOption {
  text: string;
  correct: boolean;
}

export interface McOptionsParseResult {
  questionText: string;
  options: McOption[];
}

const LOESUNG_MULTI_RE = /\\LoesungMulti\[\d+\]\{([\s\S]*)\}\s*$/;
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
    return { questionText: body, options: [] };
  }

  const questionText = body.slice(0, match.index).trim();
  const optionsBlock = match[1];
  const options: McOption[] = [];
  let optionMatch: RegExpExecArray | null;
  OPTION_RE.lastIndex = 0;
  while ((optionMatch = OPTION_RE.exec(optionsBlock)) !== null) {
    options.push({ text: optionMatch[2].trim(), correct: optionMatch[1] === "Lmulti" });
  }

  return { questionText, options };
}

/**
 * Builds a MC exercise's latex body from question text + structured options.
 */
export function buildMcOptionsLatex(questionText: string, options: McOption[]): string {
  const lines = options
    .map((o) => `  \\${o.correct ? "Lmulti" : "multi"}{${o.text}}`)
    .join("\n");
  return `${questionText.trim()}\n\n\\LoesungMulti[${options.length}]{\n${lines}\n}`;
}
