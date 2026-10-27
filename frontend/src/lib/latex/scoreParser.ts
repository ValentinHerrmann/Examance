/**
 * Parses an exercise's max_points from its LaTeX: a fixed score (`\begin{Aufgabe}[N]` or
 * `\FestePunkte{N}`) wins; else \BE and \Lmulti +1, \hBE +0.5, \qBE +0.25, with part exercises
 * contributing their own fixed scores (see exerciseStructure.ts).
 */

import { usesAlphaLabels } from "#lib/grading/mcGroupLabels";
import { parseExerciseStructure } from "#lib/latex/exerciseStructure";
import { markSource } from "#lib/latex/sourceMap";

export function parseExerciseScore(latex: string): number {
  if (!latex) return 0;
  return parseExerciseStructure(latex).score;
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
 * Ensures LaTeX content is wrapped in \begin{Aufgabe}{<title>} ... \end{Aufgabe}, adding whichever is missing. With
 * `exerciseId`, an inert `\OmrExercise{<id>}` call (see Loesung.sty) is injected before the body so OMR template capture can
 * map bubbles back to exerciseId without changing the stored latexBody (see mcOptions.ts).
 * With `sourceLabel`, the body is wrapped in source markers so compile errors name it (sourceMap.ts).
 */
export function formatExerciseLatex(
  latexBody: string | undefined | null,
  title: string,
  exerciseId?: string,
  sourceLabel?: string
): string {
  const raw = latexBody || "";
  let body = sourceLabel === undefined ? raw : markSource(raw, sourceLabel);
  if (exerciseId) {
    body = `\\OmrExercise{${exerciseId}}\n${body}`;
  }
  let prefix = "";
  let suffix = "";

  if (!raw.includes("\\begin{Aufgabe}")) {
    prefix = `\\begin{Aufgabe}{${escapeLatex(title)}}\n`;
  }
  if (!raw.includes("\\end{Aufgabe}")) {
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
  /** Names the member in compile errors (see formatExerciseLatex). */
  sourceLabel?: string;
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
    .map((m) => `\\item \\OmrExercise{${m.id}}\n${m.sourceLabel === undefined ? m.latexBody : markSource(m.latexBody, m.sourceLabel)}`)
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
