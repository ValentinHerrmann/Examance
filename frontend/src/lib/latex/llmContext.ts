/**
 * Context shared by the AI-chat prompts (compile errors, exercise writing; issue #168): English Markdown for a model
 * that knows nothing about Examance. Each fact lives in one place: the frame in `documentSetup`, what a command does
 * in TEMPLATE_COMMANDS (keep in sync with the .sty files); the prompts only add their own requirements.
 */

export const BACKSLASH = String.fromCodePoint(92);
export const LANGUAGES: Record<string, string> = { de: 'German', en: 'English' };
const PDFTEX_ONLY = new Set(['iftex', 'inputenc', 'fontenc']);

/** Inline Markdown code. */
export function code(text: string): string {
  return '`' + text + '`';
}

/** A control sequence as inline code: `cs('BE')` is \BE in backticks. */
export function cs(name: string): string {
  return code(BACKSLASH + name);
}

const AUFGABE_FRAME = String.raw`\begin{Aufgabe}{exercise name} … \end{Aufgabe}`;
const USEPACKAGE = String.raw`\usepackage[options]{name}`;
const LISTING_ESCAPE = String.raw`(*@\BE@*)`;

export function section(heading: string, body: string): string {
  return `## ${heading}\n${body}`;
}

export function fence(text: string, language = ''): string {
  return '```' + language + '\n' + text.replaceAll('```', "'''") + '\n```';
}

interface TemplateCommand {
  /** Command and environment names, for finding their definitions. */
  names: string[];
  forms: string[];
  text: string;
}

/** Teacher-facing commands of Schulaufgabe.sty / Loesung.sty. */
const TEMPLATE_COMMANDS: TemplateCommand[] = [
  { names: ['Teilaufgabe'], forms: [String.raw`\begin{Teilaufgabe}[fixed points]{subtitle} … \end{Teilaufgabe}`], text: 'part a), b), … with its own score box.' },
  { names: ['BE', 'hBE', 'qBE'], forms: [String.raw`\BE`, String.raw`\hBE`, String.raw`\qBE`], text: 'one, a half, a quarter point, placed in the solution where it is earned (a check mark on the solution sheet).' },
  { names: ['FestePunkte'], forms: [String.raw`\FestePunkte{n}`], text: 'fixed score for the enclosing part or exercise instead of the counted points.' },
  { names: ['AFB', 'Kompetenz'], forms: [String.raw`\AFB{I|II|III}`, String.raw`\Kompetenz{text}`], text: 'metadata tags, printed only on the solution sheet.' },
  { names: ['Loesung'], forms: [String.raw`\Loesung{solution}`], text: 'nothing on the student sheet.' },
  { names: ['LoesungReplace'], forms: [String.raw`\LoesungReplace{solution}{student text}`], text: 'other text on the student sheet.' },
  { names: ['LoesungLeer'], forms: [String.raw`\LoesungLeer{solution}{height}`], text: 'empty space of that height (e.g. 3cm) on the student sheet.' },
  { names: ['LoesungLuecke'], forms: [String.raw`\LoesungLuecke{solution}{width}`], text: 'fill-in gap: a rule of that width on the student sheet.' },
  { names: ['LoesungKaro'], forms: [String.raw`\LoesungKaro{solution}{rows}`], text: 'a squared grid with that many 0.5 cm rows on the student sheet.' },
  { names: ['LoesungLine'], forms: [String.raw`\LoesungLine{solution}{rows}`], text: 'that many ruled lines on the student sheet.' },
  { names: ['LoesungImg'], forms: [String.raw`\LoesungImg{solution image}{student image}{width}`], text: 'a different image file per sheet.' },
  {
    names: ['LoesungCode'],
    forms: [String.raw`\begin{LoesungCode} … \end{LoesungCode}`],
    text: `code solution, the only one that may contain ${code('lstlisting')}; inside a listing, ${code(LISTING_ESCAPE)} escapes to LaTeX.`,
  },
  {
    names: ['LoesungMulti', 'multi', 'Lmulti'],
    forms: [String.raw`\LoesungMulti[columns]{ \multi{wrong} \Lmulti{correct} … }`],
    text: `multiple-choice options, one per line; each correct option counts one point (no ${cs('BE')}). ${cs('multi')} and ${cs('Lmulti')} are list items and work only inside it.`,
  },
  { names: ['kariert', 'liniert', 'Leer'], forms: [String.raw`\kariert[size]{rows}`, String.raw`\liniert[spacing]{rows}`, String.raw`\Leer{height}`], text: 'squared grid, ruled lines, empty space.' },
  { names: ['Seitenumbruch'], forms: [String.raw`\Seitenumbruch`], text: 'page break between blocks of an exercise.' },
];

/** Names whose definitions a prompt may quote; `Aufgabe` is the frame the app adds. */
export const TEMPLATE_NAMES = ['Aufgabe', ...TEMPLATE_COMMANDS.flatMap((c) => c.names)];

export function templateCommandsSection(): string {
  const intro = `Every ${cs('Loesung…')} command takes the solution first; it is shown only on the solution sheet, and the second argument says what the student sheet shows instead.`;
  const lines = TEMPLATE_COMMANDS.map((c) => `- ${c.forms.map(code).join(', ')}: ${c.text}`);
  return section(`Template commands (${code('Schulaufgabe.sty')}, ${code('Loesung.sty')})`, [intro, ...lines].join('\n'));
}

/** The document frame: engine, what the app generates, the two sheets, where packages go. */
export function documentSetup(engine: 'local' | 'server' | null): string {
  const compiler =
    engine === 'local'
      ? 'XeLaTeX in the browser (busytex, a reduced TeX Live 2026)'
      : 'XeLaTeX on the server (Tectonic with TeX Live 2022; packages newer than 2022 are missing)';
  return [
    `- Engine: ${compiler}; UTF-8 input with ${code('fontspec')}.`,
    `- The teacher edits only the body of an exercise. The app generates everything else: class ${code('article')} with the template package ${code('Schulaufgabe.sty')} (it loads ${code('Loesung.sty')} and ${code('packages.sty')}), the header, and ${code(AUFGABE_FRAME)} around the body.`,
    `- Every document is compiled twice: the student sheet and the solution sheet (package option ${code('antworten')}). Solution arguments are typeset on the student sheet too (into a discarded box), so they must always compile; being macro arguments, they cannot hold verbatim material (${cs('verb')}, ${code('lstlisting')}).`,
    `- Extra packages: ${code(USEPACKAGE)} on a line of its own in the body (the app moves it into the preamble) or the app's LaTeX package settings; anywhere else it fails.`,
  ].join('\n');
}

/** The files attached to the exercises (callers add the label), which LaTeX finds by their flat name. */
export function attachedFiles(names: readonly string[]): string {
  if (names.length === 0) return 'None; the exercises have no attached files.';
  return `${names.map(code).join(', ')}, usable by this flat name in ${cs('includegraphics')} or ${cs('input')}.`;
}

/** Package names `packages.sty` loads, without the pdfTeX-only ones and the `sty/` prefix. */
export function preloadedPackages(packagesSty: string): string[] {
  return [...packagesSty.matchAll(/\\RequirePackage(?:\[[^\]]*\])?\{([^}]*)\}/g)]
    .map((m) => m[1].replace(/^sty\//, ''))
    .filter((name) => !PDFTEX_ONLY.has(name));
}
