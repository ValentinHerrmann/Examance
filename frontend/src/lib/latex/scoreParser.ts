/**
 * Pure helper to parse exercise max_points from LaTeX: `\begin{Aufgabe}[N]` override returns N;
 * else \BE +1, \Lmulti +1, \hBE +0.5, \qBE +0.25.
 */

import { usesAlphaLabels } from "#lib/grading/mcGroupLabels";

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
 * Escapes LaTeX special characters in plain user text (e.g. titles) before interpolating it into a
 * command argument. Mirrors `escape_tex` in backend/app/services/latex.py. Do NOT use on fields
 * that are raw LaTeX by design (latexBody).
 */
export function escapeLatex(text: string | undefined | null): string {
  if (!text) return "";
  return text.replace(/[\\&%$#_{}~^]/g, (ch) => TEX_ESCAPE_MAP[ch] ?? ch);
}

const TEX_UNESCAPE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(TEX_ESCAPE_MAP).map(([ch, seq]) => [seq, ch])
);

/** Inverse of `escapeLatex`. One pass, so `\textbackslash{}\%` comes back as `\%`, not `%`. */
export function unescapeLatex(text: string | undefined | null): string {
  if (!text) return "";
  return text.replace(
    /\\(?:textbackslash|textasciitilde|textasciicircum)\{\}|\\[&%$#_{}]/g,
    (seq) => TEX_UNESCAPE_MAP[seq] ?? seq
  );
}

/**
 * Ensures LaTeX content is wrapped in \begin{Aufgabe}{<title>} ... \end{Aufgabe}, adding whichever is missing.
 *
 * With `exerciseId`, an `\OmrExercise{<id>}` call is injected before the body (inert without
 * `\multi`/`\Lmulti`, see Loesung.sty) so OMR template capture can map bubbles back to exerciseId
 * without changing the stored latexBody (see mcOptions.ts).
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
 * Formats MC sub-exercise bodies into one \begin{Aufgabe} block with enumerate[label=\alph*)], or
 * \arabic*) past 26 members (mirrors mcSubLabel in #lib/grading/mcGroupLabels). Each member gets
 * `\OmrExercise{<id>}` (see formatExerciseLatex); grading/statistics still key on exerciseId, the group is layout-only.
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
    `\\begin{enumerate}[label=\\${usesAlphaLabels(members.length) ? "alph" : "arabic"}*)]\n` +
    `${items}\n` +
    `\\end{enumerate}\n\n` +
    `\\LoesungLeer{${escapeLatex(scoringText)}}{0pt}\n` +
    `\\end{Aufgabe}`
  );
}
