/**
 * Pure helper to parse exercise max_points from LaTeX content.
 *
 * Scoring rules:
 * - \begin{Aufgabe}[N] manual override (e.g. \begin{Aufgabe}[10]) -> returns N
 * - Count \BE -> +1.0
 * - Count \Lmulti -> +1.0
 * - Count \hBE -> +0.5
 * - Count \qBE -> +0.25
 */
export function parseExerciseScore(latex: string): number {
  if (!latex) return 0;

  const override = latex.match(/\\begin\{Aufgabe\}\[([\d.]+)\]/);
  if (override && override[1]) {
    const parsed = parseFloat(override[1]);
    if (!isNaN(parsed)) return parsed;
  }

  const beMatches = latex.match(/\\BE\b/g);
  const lmultiMatches = latex.match(/\\Lmulti\b/g);
  const halfMatches = latex.match(/\\hBE\b/g);
  const quartMatches = latex.match(/\\qBE\b/g);

  const full = (beMatches ? beMatches.length : 0) + (lmultiMatches ? lmultiMatches.length : 0);
  const half = halfMatches ? halfMatches.length : 0;
  const quart = quartMatches ? quartMatches.length : 0;

  return full * 1.0 + half * 0.5 + quart * 0.25;
}

const TEX_ESCAPE_MAP: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "&": "\\&",
  "%": "\\%",
  "$": "\\$",
  "#": "\\#",
  "_": "\\_",
  "{": "\\{",
  "}": "\\}",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}"
};

/**
 * Escapes LaTeX special characters in plain (non-LaTeX) user text before
 * it's interpolated into a command argument, e.g. \begin{Aufgabe}{<title>}.
 * Mirrors `escape_tex` in backend/app/services/latex.py.
 *
 * Do NOT use this on fields that are legitimately raw LaTeX by design
 * (latexBody) -- only on plain-text metadata like titles/scoring text.
 */
export function escapeLatex(text: string | undefined | null): string {
  if (!text) return "";
  return text.replace(/[\\&%$#_{}~^]/g, (ch) => TEX_ESCAPE_MAP[ch] ?? ch);
}

/**
 * Ensures LaTeX content is wrapped in \begin{Aufgabe}{<title>} ... \end{Aufgabe}.
 * - If \begin{Aufgabe} is missing, prepends \begin{Aufgabe}{<title>}.
 * - If \end{Aufgabe} is missing, appends \end{Aufgabe}.
 *
 * If `exerciseId` is given, an `\OmrExercise{<id>}` call is injected right
 * before the body. It is inert unless the body uses `\multi`/`\Lmulti`
 * (MC options) -- see Loesung.sty -- so it's safe to inject unconditionally
 * for free-text exercises too. This is what lets the OMR template capture
 * (pdfjs getAnnotations() on the compiled PDF) map bubbles back to exerciseId
 * without changing the stored latexBody or the \LoesungMulti/\multi/\Lmulti
 * call sites (see mcOptions.ts).
 */
export function formatExerciseLatex(
  latexBody: string | undefined | null,
  title: string,
  exerciseId?: string
): string {
  let body = latexBody || "";
  if (exerciseId) {
    body = `\\OmrExercise{${exerciseId}}\n${body}`;
  }
  let prefix = "";
  let suffix = "";

  if (!body.includes("\\begin{Aufgabe}")) {
    prefix = `\\begin{Aufgabe}{${escapeLatex(title)}}\n`;
  }
  if (!body.includes("\\end{Aufgabe}")) {
    if (body.length > 0 && !body.endsWith("\n")) {
      suffix = "\n\\end{Aufgabe}";
    } else {
      suffix = "\\end{Aufgabe}";
    }
  }

  return `${prefix}${body}${suffix}`;
}

export interface McGroupMember {
  id: string;
  latexBody: string;
}

/**
 * Formats a list of MC sub-exercise bodies into one \begin{Aufgabe} block with enumerate[label=\alph*)].
 *
 * Each member gets `\OmrExercise{<id>}` injected before its body (see
 * formatExerciseLatex doc comment) -- grading/statistics still key strictly
 * on exerciseId (CLAUDE.md invariant); the group is layout-only here too.
 */
export function formatMcGroupLatex(
  members: McGroupMember[],
  groupTitle: string,
  scoringText: string
): string {
  const items = members
    .map((m) => `\\item \\OmrExercise{${m.id}}\n${m.latexBody}`)
    .join("\n");
  return (
    `\\begin{Aufgabe}{${escapeLatex(groupTitle)}}` +
    ` Kreuze jeweils die korrekten Lösungen an. Mehrere können, mind. eine ist jeweils richtig.` +
    ` Für falsch gesetzte Kreuze werden Punkte abgezogen (pro Teilaufgabe immer $\\geq 0$ Punkte)\n\n` +
    `\\begin{enumerate}[label=\\alph*)]\n` +
    `${items}\n` +
    `\\end{enumerate}\n\n` +
    `\\LoesungLeer{${escapeLatex(scoringText)}}{0pt}\n` +
    `\\end{Aufgabe}`
  );
}
