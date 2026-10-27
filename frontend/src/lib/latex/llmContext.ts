/**
 * Context shared by the AI-chat prompts (compile errors, exercise writing; issue #168). The prompts are English and
 * written for a model that knows nothing about Examance; keep TEMPLATE_COMMANDS in sync with the .sty files.
 */

export const BACKSLASH = String.fromCodePoint(92);
export const LANGUAGES: Record<string, string> = { de: 'German', en: 'English' };
const PDFTEX_ONLY = new Set(['iftex', 'inputenc', 'fontenc']);

/** Teacher-facing commands of Schulaufgabe.sty / Loesung.sty; keep in sync with the .sty files. */
export const TEMPLATE_COMMANDS: { name: string; usage: string }[] = [
  { name: 'Aufgabe', usage: String.raw`\begin{Aufgabe}[fixed points]{title} … \end{Aufgabe}: one exercise with a score box. The app wraps every exercise body in it unless the body contains \begin{Aufgabe} itself.` },
  { name: 'Teilaufgabe', usage: String.raw`\begin{Teilaufgabe}[fixed points]{subtitle} … \end{Teilaufgabe}: part a), b), … with its own score box.` },
  { name: 'BE', usage: String.raw`\BE, \hBE, \qBE: one, a half, a quarter point, placed in the solution where it is earned (a check mark on the solution sheet).` },
  { name: 'FestePunkte', usage: String.raw`\FestePunkte{n}: fixed score for the enclosing Teilaufgabe or Aufgabe instead of the counted points.` },
  { name: 'AFB', usage: String.raw`\AFB{I|II|III}, \Kompetenz{text}: metadata tags, printed only on the solution sheet.` },
  { name: 'Loesung', usage: String.raw`\Loesung{solution}: solution text, only on the solution sheet.` },
  { name: 'LoesungReplace', usage: String.raw`\LoesungReplace{solution}{student text}: the solution on the solution sheet, other text on the student sheet.` },
  { name: 'LoesungLeer', usage: String.raw`\LoesungLeer{solution}{height}: the solution, or empty space of that height (e.g. 3cm) on the student sheet.` },
  { name: 'LoesungLuecke', usage: String.raw`\LoesungLuecke{solution}{width}: fill-in gap: the solution, or a rule of that width.` },
  { name: 'LoesungKaro', usage: String.raw`\LoesungKaro{solution}{rows}: the solution, or a squared grid with that many 0.5 cm rows.` },
  { name: 'LoesungLine', usage: String.raw`\LoesungLine{solution}{rows}: the solution, or that many ruled lines.` },
  { name: 'LoesungImg', usage: String.raw`\LoesungImg{solution image}{student image}{width}: a different image file per sheet.` },
  { name: 'LoesungCode', usage: String.raw`\begin{LoesungCode} … \end{LoesungCode}: code solution; the only solution command that may contain lstlisting (escape to LaTeX inside a listing with (*@ … @*), e.g. (*@\BE@*)).` },
  { name: 'LoesungMulti', usage: String.raw`\LoesungMulti[columns]{ \multi{wrong option} \Lmulti{correct option} … }: multiple-choice options (one per line); \multi and \Lmulti are \item commands and only work inside \LoesungMulti.` },
  { name: 'kariert', usage: String.raw`\kariert[size]{rows}, \liniert[spacing]{rows}, \Leer{height}: squared grid, ruled lines, empty space.` },
  { name: 'Seitenumbruch', usage: String.raw`\Seitenumbruch: page break between blocks of an exercise.` },
];

export function documentSetup(engine: 'local' | 'server' | null): string {
  const compiler =
    engine === 'local'
      ? 'XeLaTeX in the browser (busytex, a reduced TeX Live 2026)'
      : 'XeLaTeX on the server (Tectonic with TeX Live 2022; packages newer than 2022 are missing)';
  return [
    `- Engine: ${compiler}. Input is UTF-8 with fontspec; inputenc/fontenc are not used.`,
    String.raw`- Class article with the template package Schulaufgabe.sty, which loads Loesung.sty and packages.sty. Each exercise body sits inside \begin{Aufgabe}{title} … \end{Aufgabe}.`,
    String.raw`- Every exam and exercise is compiled twice: the student sheet and the solution sheet (package option "antworten"). On the student sheet the solution arguments are still typeset into a discarded box, so they must compile there too. Solution arguments are macro arguments: verbatim material (\verb, lstlisting) is only allowed in the LoesungCode environment.`,
    String.raw`- Extra packages: a line containing only \usepackage[options]{name} in the exercise code (the app moves it into the preamble) or the app's LaTeX package settings. A \usepackage elsewhere in the body fails.`,
  ].join('\n');
}

/** Package names `packages.sty` loads, without the pdfTeX-only ones and the `sty/` prefix. */
export function preloadedPackages(packagesSty: string): string[] {
  return [...packagesSty.matchAll(/\\RequirePackage(?:\[[^\]]*\])?\{([^}]*)\}/g)]
    .map((m) => m[1].replace(/^sty\//, ''))
    .filter((name) => !PDFTEX_ONLY.has(name));
}

export function section(heading: string, body: string): string {
  return `## ${heading}\n${body}`;
}

export function fence(text: string, language = ''): string {
  return '```' + language + '\n' + text.replaceAll('```', "'''") + '\n```';
}
