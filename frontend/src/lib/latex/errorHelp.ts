/**
 * Help for failed compiles (issue #168): typical causes of common TeX errors and a self-contained prompt for an
 * external AI chat. Clipboard only, nothing is sent. The prompt is written for a model that knows nothing about
 * Examance, so it explains the document frame; it is English (machine-facing) and asks for a reply in the UI language.
 */
import type { LatexAsset } from './assets';
import { BACKSLASH, code, documentSetup, fence, LANGUAGES, preloadedPackages, section, TEMPLATE_NAMES, templateCommandsSection } from './llmContext';
import { mapLine, type SourceMap, type SourceRange } from './sourceMap';
import { extractTexErrors } from './texLog';

export type TexErrorCause = { id: string; detail?: string };

// One entry per id; specific messages before generic ones.
const CAUSES: { id: string; pattern: RegExp }[] = [
  { id: 'undefinedControl', pattern: /^! Undefined control sequence/m },
  { id: 'missingDollar', pattern: /^! Missing \$ inserted/m },
  { id: 'bodyPackage', pattern: /^! Package Schulaufgabe Error: Package `/m },
  { id: 'fileNotFound', pattern: /^! (?:LaTeX Error: )?File `[^']+' not found|^! I can't find file/m },
  { id: 'fontNotFound', pattern: /^! (?:Package fontspec Error: )?The font "[^"]+" cannot be found|^! Font \S+ not loadable/m },
  { id: 'environmentUndefined', pattern: /^! LaTeX Error: Environment \S+ undefined/m },
  { id: 'beginEnd', pattern: /^! LaTeX Error: \\begin\{[^}]*\} on input line \d+ ended by \\end/m },
  { id: 'braces', pattern: /^! (?:Missing \} inserted|Extra \}, or forgotten|Too many \}'s|Paragraph ended before|File ended while scanning|Runaway argument)/m },
  { id: 'alignmentTab', pattern: /^! Misplaced alignment tab character &/m },
  { id: 'missingItem', pattern: /^! LaTeX Error: (?:Lonely \\item|Something's wrong--perhaps a missing \\item)/m },
  { id: 'tooDeeplyNested', pattern: /^! LaTeX Error: Too deeply nested/m },
  { id: 'dimensionTooLarge', pattern: /^! Dimension too large/m },
  { id: 'packageError', pattern: /^! (?:Package|Class) \S+ Error/m },
  { id: 'emergencyStop', pattern: /^! Emergency stop/m },
];

/** The typical causes for the errors in `log`; empty when nothing matches. */
export function explainTexErrors(log: string | null | undefined): TexErrorCause[] {
  if (!log) return [];
  const causes: TexErrorCause[] = [];
  for (const { id, pattern } of CAUSES) {
    if (!pattern.test(log)) continue;
    // A Schulaufgabe package error is also a generic package error; "Emergency stop" only helps alone.
    if (id === 'packageError' && causes.some((c) => c.id === 'bodyPackage')) continue;
    if (id === 'emergencyStop' && causes.length > 0) continue;
    causes.push(id === 'undefinedControl' ? { id, detail: undefinedMacro(log) ?? undefined } : { id });
  }
  return causes;
}

/** `l.<n> text` of an error block, without the location annotateLog appends. */
function contextLine(block: string): { line: number; echoed: string } | null {
  // extractTexErrors trims lines, so an empty context ("Paragraph ended before …") is a bare `l.<n>`.
  const ctx = /^l\.(\d+)(?: (.*))?$/m.exec(block);
  if (!ctx) return null;
  const text = ctx[2] ?? '';
  const note = text.lastIndexOf('    [');
  return { line: Number(ctx[1]), echoed: note >= 0 ? text.slice(0, note) : text };
}

/** The macro TeX stopped at: the last control sequence on the `l.<n>` line after the error. */
function undefinedMacro(log: string): string | null {
  const block = extractTexErrors(log).find((b) => b.startsWith('! Undefined control sequence'));
  const ctx = block ? contextLine(block) : null;
  return ctx?.echoed.match(/\\[A-Za-z@]+/g)?.at(-1) ?? null;
}

// --- Prompt ---------------------------------------------------------------------------------------------------------

const LINE_NUMBERS = `- Line numbers: ${code('l.<n>')} in the log counts lines of the whole generated document. Where the app could map it, the log names the exercise and its editor line in square brackets; exercise code below is numbered like the editor.`;
const OWN_STYLES = ['sty/Schulaufgabe.sty', 'sty/Loesung.sty'];
const DEFINERS = [String.raw`\newcommand`, String.raw`\renewcommand`, String.raw`\providecommand`, String.raw`\newenvironment`, String.raw`\def`];

const LOG_TAIL_LINES = 40;
const LOG_TAIL_CHARS = 3000;
const PREAMBLE_LINES = 60;
const EXERCISE_LINES = 200;
const CONTEXT_LINES = 12;
const DEFINITION_CHARS = 1200;

export interface AiPromptInput {
  log: string;
  engine: 'local' | 'server' | null;
  /** The unmarked document that failed and where each exercise body sits in it. */
  source?: string | null;
  ranges?: readonly SourceRange[];
  /** Adds the code of the exercises the errors point at (opt-in: it is exam content). */
  includeSource: boolean;
  /** Bundled assets, if they could be loaded: the preloaded package list and the definitions of commands in errors. */
  assets?: LatexAsset[] | null;
  /** UI locale; the AI is asked to answer in it. */
  locale: string;
}

/** A self-contained prompt for an AI chat that has no other context. */
export function buildAiPrompt(input: AiPromptInput): string {
  const blocks = extractTexErrors(input.log);
  const sources = new Map((input.assets ?? []).map((a) => [a.path, new TextDecoder().decode(a.content)]));
  const parts = [
    intro(LANGUAGES[input.locale] ?? 'English'),
    section('How the document is built', `${documentSetup(input.engine)}\n${LINE_NUMBERS}`),
    templateCommandsSection(),
    packagesSection(input.source, sources.get('sty/packages.sty')),
    ...logSections(input.log, blocks),
    definitionsSection(blocks, sources),
    input.includeSource && input.source
      ? section('Code', codeExcerpts(input.source, input.ranges ?? [], blocks))
      : section('Code', 'Not included. If you need it, ask for the exercise code around the line named in the error.'),
  ];
  return parts.filter(Boolean).join('\n\n') + '\n';
}

/** The log tail, preceded by the error blocks it does not already contain; a short log is shown once, whole. */
function logSections(log: string, blocks: string[]): string[] {
  if (log.trimEnd().split('\n').length <= LOG_TAIL_LINES) return [section('Log', fence(log.trimEnd(), 'text'))];
  const tail = logTail(log);
  const earlier = blocks.filter((block) => !tail.includes(block.split('\n')[0]));
  return [
    earlier.length > 0 ? section('Earlier error messages', fence(earlier.join('\n\n'), 'text')) : '',
    section(`End of the log (last ${LOG_TAIL_LINES} lines)`, fence(tail, 'text')),
  ];
}

function intro(language: string): string {
  return [
    '# Help me fix a LaTeX compile error',
    'You are helping a teacher who writes exam exercises in Examance, a web app that typesets school exams with LaTeX. ' +
      `The teacher is usually not a LaTeX expert. Reply in ${language}.`,
    '',
    'Please answer with:',
    '1. In plain words: what the error means and which exercise line causes it.',
    '2. The corrected lines of the exercise code, ready to paste into the exercise editor.',
    '3. If the cause is outside the exercise code (e.g. a missing package), what to change in the app instead.',
    '',
    'Use only the template commands below or standard LaTeX and package commands. If the information is not enough to be sure, say what you would need.',
  ].join('\n');
}

/** Preloaded packages and the document's own preamble lines (no header fields such as the teacher's name). */
function packagesSection(source: string | null | undefined, packagesSty: string | undefined): string {
  const lines: string[] = [];
  if (packagesSty) {
    lines.push(`${code('packages.sty')} preloads: ${preloadedPackages(packagesSty).map(code).join(', ')}.`);
  }
  const preamble = source ? preambleLines(source) : [];
  if (preamble.length > 0) lines.push('Preamble of this document:', fence(preamble.join('\n'), 'latex'));
  return lines.length > 0 ? section('Packages', lines.join('\n')) : '';
}

const HEADER_FIELDS = ['Info', 'Fach', 'Lehrer', 'Testart', 'Klasse', 'Datum', 'Nr', 'ExamLogoFile'].map((n) => BACKSLASH + n);

/** Header fields (teacher, class, date) never go into a prompt. */
function isHeaderField(line: string): boolean {
  return HEADER_FIELDS.some((field) => line.trimStart().startsWith(field));
}

function preambleLines(source: string): string[] {
  const end = source.indexOf(String.raw`\begin{document}`);
  if (end < 0) return [];
  return source
    .slice(0, end)
    .split('\n')
    .filter((line) => line.trim() && !isHeaderField(line))
    .slice(0, PREAMBLE_LINES);
}

/** Full definitions of the template commands an error mentions. */
function definitionsSection(blocks: string[], sources: Map<string, string>): string {
  const text = blocks.join('\n');
  const found: string[] = [];
  for (const name of TEMPLATE_NAMES) {
    if (!mentions(text, name)) continue;
    for (const path of OWN_STYLES) {
      const def = definitionOf(sources.get(path), name);
      if (def) found.push(`% ${path}\n${def}`);
    }
  }
  return found.length > 0 ? section('Definitions of the template commands in the error', fence(found.join('\n\n'), 'latex')) : '';
}

/** Whether `text` mentions `\name` or `{name}` with no letter right after the name. */
function mentions(text: string, name: string): boolean {
  for (const needle of [BACKSLASH + name, `{${name}}`]) {
    let at = text.indexOf(needle);
    while (at >= 0) {
      if (!/[A-Za-z]/.test(text.charAt(at + needle.length)) || needle.endsWith('}')) return true;
      at = text.indexOf(needle, at + 1);
    }
  }
  return false;
}

function braceDelta(line: string): number {
  let delta = 0;
  for (const c of line.replaceAll(String.raw`\{`, '').replaceAll(String.raw`\}`, '').split('%')[0]) {
    if (c === '{') delta++;
    else if (c === '}') delta--;
  }
  return delta;
}

/** The definition starting at the line that defines `name`, until its braces balance. */
function definitionOf(text: string | undefined, name: string): string | null {
  if (!text) return null;
  const lines = text.split('\n');
  const start = lines.findIndex((l) => DEFINERS.some((d) => l.trimStart().startsWith(d)) && mentions(l, name));
  if (start < 0) return null;
  const out: string[] = [];
  let depth = 0;
  for (const line of lines.slice(start)) {
    out.push(line);
    depth += braceDelta(line);
    if (depth <= 0 || out.join('\n').length > DEFINITION_CHARS) break;
  }
  return out.join('\n').slice(0, DEFINITION_CHARS);
}

/** Each exercise an error points at, numbered like the editor; errors in the frame get a few lines around them. */
function codeExcerpts(source: string, ranges: readonly SourceRange[], blocks: string[]): string {
  const lines = source.split('\n');
  const map = { tex: source, ranges: [...ranges] };
  const excerpts = new Map<string, string>();
  for (const block of blocks) {
    const excerpt = excerptFor(block, lines, map);
    if (excerpt && !excerpts.has(excerpt.key)) excerpts.set(excerpt.key, excerpt.text);
  }
  return excerpts.size > 0
    ? [...excerpts.values()].join('\n\n')
    : 'The errors could not be traced to a line of the document (they happened inside a package).';
}

function excerptFor(block: string, lines: string[], map: SourceMap): { key: string; text: string } | null {
  const ctx = contextLine(block);
  const loc = ctx ? mapLine(map, ctx.line, ctx.echoed) : null;
  if (!ctx || !loc) return null;
  const range = loc.label === null ? undefined : map.ranges.find((r) => ctx.line >= r.start && ctx.line <= r.end);
  if (range) return { key: `exercise:${range.start}`, text: exerciseExcerpt(lines, range, loc.line) };
  return { key: `frame:${ctx.line}`, text: frameExcerpt(lines, ctx.line) };
}

function numbered(lines: string[], from: number, to: number, first: number): string {
  const width = String(first + to - from).length;
  return lines
    .slice(from, to + 1)
    .map((line, i) => `${String(first + i).padStart(width)}| ${isHeaderField(line) ? '% (header field omitted)' : line}`)
    .join('\n');
}

function exerciseExcerpt(lines: string[], range: SourceRange, errorLine: number): string {
  const size = range.end - range.start + 1;
  // Whole exercise when it fits, else the lines around the error (editor numbering).
  const from = size <= EXERCISE_LINES ? 1 : Math.max(1, errorLine - CONTEXT_LINES);
  const to = size <= EXERCISE_LINES ? size : Math.min(size, errorLine + CONTEXT_LINES);
  const body = numbered(lines, range.start - 1 + from - 1, range.start - 1 + to - 1, from);
  return `Exercise "${range.label}", error at line ${errorLine}:\n${fence(body, 'latex')}`;
}

function frameExcerpt(lines: string[], line: number): string {
  const from = Math.max(1, line - CONTEXT_LINES);
  const to = Math.min(lines.length, line + CONTEXT_LINES);
  return `Generated document around line ${line}:\n${fence(numbered(lines, from - 1, to - 1, from), 'latex')}`;
}

function logTail(log: string): string {
  const lines = log.trimEnd().split('\n');
  const tail = lines.slice(-LOG_TAIL_LINES).join('\n');
  const capped = tail.slice(-LOG_TAIL_CHARS);
  return capped.length < log.trimEnd().length ? `[…]\n${capped}` : capped;
}
