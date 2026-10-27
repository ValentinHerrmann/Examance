/**
 * Help for failed compiles (issue #168): typical causes of common TeX errors and a compact prompt
 * for an external AI chat. Clipboard only, nothing is sent; the source is in it only on request.
 */
import { translate } from '#lib/i18n';
import type { LatexAsset } from './assets';
import { extractTexErrors } from './texLog';

export type TexErrorCause = { id: string; detail?: string };

// First match wins per id; order puts specific messages before generic ones.
const CAUSES: { id: string; pattern: RegExp }[] = [
  { id: 'undefinedControl', pattern: /^! Undefined control sequence/m },
  { id: 'missingDollar', pattern: /^! Missing \$ inserted/m },
  { id: 'fileNotFound', pattern: /^! (?:LaTeX Error: )?File `[^']+' not found|^! I can't find file/m },
  { id: 'fontNotFound', pattern: /^! (?:Package fontspec Error: )?The font "[^"]+" cannot be found|^! Font .* not loadable/m },
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
    const m = pattern.exec(log);
    if (!m) continue;
    // "Emergency stop" only adds something when it is the only error.
    if (id === 'emergencyStop' && causes.length > 0) continue;
    causes.push(id === 'undefinedControl' ? { id, detail: undefinedMacro(log) ?? undefined } : { id });
  }
  return causes;
}

/** The macro TeX stopped at: the last control sequence on the `l.<n>` line after the error. */
function undefinedMacro(log: string): string | null {
  const block = extractTexErrors(log).find((b) => b.startsWith('! Undefined control sequence'));
  const ctx = block && /^l\.\d+ (.*)$/m.exec(block);
  const names = ctx ? ctx[1].replace(/\s*\[[^\]]*\]$/, '').match(/\\[A-Za-z@]+\*?/g) : null;
  return names ? names[names.length - 1] : null;
}

/** Our own style files; third-party ones are listed by name only. */
const OWN_STYLES = ['sty/Schulaufgabe.sty', 'sty/Loesung.sty', 'sty/packages.sty'];
const DEFINITION =
  /\\(?:(?:re)?newcommand\*?|providecommand\*?|(?:New|Renew|Provide|Declare)DocumentCommand)\s*\{?\\([A-Za-z]+)|\\[gex]?def\s*\\([A-Za-z]+)|\\(?:re)?newenvironment\*?\s*\{([A-Za-z*]+)\}|\\(?:New|Renew)DocumentEnvironment\s*\{([A-Za-z*]+)\}/g;

const LOG_TAIL_LINES = 60;
const LOG_TAIL_CHARS = 4000;
const CONTEXT_LINES = 15;
const WHOLE_SOURCE_LINES = 150;
const DEFINITION_CHARS = 1500;

export interface AiPromptInput {
  log: string;
  engine: 'local' | 'server' | null;
  /** The unmarked document that failed; used only with `includeSource`. */
  source?: string | null;
  includeSource: boolean;
  /** Bundled assets, if they could be loaded; without them the prompt only names the engine. */
  assets?: LatexAsset[] | null;
}

/** A self-contained prompt for an AI chat, kept short: errors, log tail, macro names, optional source excerpt. */
export function buildAiPrompt(input: AiPromptInput): string {
  const { log, engine, source, includeSource, assets } = input;
  const blocks = extractTexErrors(log);
  const parts: string[] = [translate('misc.compiler.ai.intro')];

  parts.push(
    section(
      translate('misc.compiler.ai.setupHeading'),
      [
        translate(engine === 'local' ? 'misc.compiler.ai.engineLocal' : 'misc.compiler.ai.engineServer'),
        translate('misc.compiler.ai.setup'),
      ].join('\n')
    )
  );

  if (blocks.length > 0) parts.push(section(translate('misc.compiler.ai.errorsHeading'), fence(blocks.join('\n\n'))));
  parts.push(section(translate('misc.compiler.ai.logHeading'), fence(logTail(log))));

  if (assets && assets.length > 0) parts.push(section(translate('misc.compiler.ai.assetsHeading'), assetContext(assets, blocks)));

  if (includeSource && source) {
    parts.push(section(translate('misc.compiler.ai.sourceHeading'), fence(sourceExcerpt(source, blocks))));
  } else {
    parts.push(translate('misc.compiler.ai.noSource'));
  }
  return parts.join('\n\n') + '\n';
}

function section(heading: string, body: string): string {
  return `## ${heading}\n${body}`;
}

function fence(text: string): string {
  return '```\n' + text.replace(/```/g, "'''") + '\n```';
}

function logTail(log: string): string {
  const lines = log.trimEnd().split('\n');
  let tail = lines.slice(-LOG_TAIL_LINES).join('\n');
  if (tail.length > LOG_TAIL_CHARS) tail = tail.slice(-LOG_TAIL_CHARS);
  return lines.length > LOG_TAIL_LINES || tail.length === LOG_TAIL_CHARS ? `[…]\n${tail}` : tail;
}

function decode(asset: LatexAsset): string {
  return new TextDecoder().decode(asset.content);
}

/** File names, the macros our own styles define, and the full definition of any macro an error mentions. */
function assetContext(assets: LatexAsset[], blocks: string[]): string {
  const lines = [translate('misc.compiler.ai.assetFiles', { files: assets.map((a) => a.path).join(', ') })];
  const errorText = blocks.join('\n');
  const definitions: string[] = [];
  for (const path of OWN_STYLES) {
    const asset = assets.find((a) => a.path === path);
    if (!asset) continue;
    const text = decode(asset);
    const names = new Set<string>();
    for (const m of text.matchAll(DEFINITION)) {
      const command = m[1] ?? m[2];
      const env = m[3] ?? m[4];
      if (command) names.add(`\\${command}`);
      if (env) names.add(`{${env}}`);
    }
    if (names.size === 0) continue;
    lines.push(`${path}: ${[...names].join(' ')}`);
    for (const name of names) {
      const mentioned = name.startsWith('\\')
        ? new RegExp(`\\${name}(?![A-Za-z])`).test(errorText)
        : errorText.includes(name);
      const def = mentioned ? definitionOf(text, name) : null;
      if (def) definitions.push(`% ${path}\n${def}`);
    }
  }
  if (definitions.length > 0) lines.push(translate('misc.compiler.ai.definitions') + '\n' + fence(definitions.join('\n\n')));
  return lines.join('\n');
}

/** The definition starting at the first line that defines `name`, until its braces balance. */
function definitionOf(text: string, name: string): string | null {
  const lines = text.split('\n');
  const escaped = name.replace(/[\\{}*]/g, (c) => `\\${c}`);
  const start = lines.findIndex(
    (l) => !l.trimStart().startsWith('%') && new RegExp(`(?:command|def|Command|environment|Environment)\\*?\\s*\\{?${escaped}(?![A-Za-z])`).test(l)
  );
  if (start < 0) return null;
  let depth = 0;
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    out.push(line);
    for (const c of line.replace(/\\[{}]|%.*$/g, '')) depth += c === '{' ? 1 : c === '}' ? -1 : 0;
    if (depth <= 0 || out.join('\n').length > DEFINITION_CHARS) break;
  }
  const def = out.join('\n');
  return def.length > DEFINITION_CHARS ? def.slice(0, DEFINITION_CHARS) + '\n% […]' : def;
}

/** Numbered source: whole when short, else the lines around each error's `l.<n>`. */
function sourceExcerpt(source: string, blocks: string[]): string {
  const lines = source.split('\n');
  const width = String(lines.length).length;
  const numbered = (i: number) => `${String(i + 1).padStart(width)}| ${lines[i]}`;
  const errorLines = blocks
    .map((b) => /^l\.(\d+)/m.exec(b))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => Number(m[1]) - 1);
  if (lines.length <= WHOLE_SOURCE_LINES || errorLines.length === 0) {
    const shown = lines.length <= WHOLE_SOURCE_LINES ? lines.length : WHOLE_SOURCE_LINES;
    const body = Array.from({ length: shown }, (_, i) => numbered(i)).join('\n');
    return shown < lines.length ? `${body}\n[…]` : body;
  }
  const keep = new Set<number>();
  for (const at of errorLines) {
    for (let i = Math.max(0, at - CONTEXT_LINES); i <= Math.min(lines.length - 1, at + CONTEXT_LINES); i++) keep.add(i);
  }
  const out: string[] = [];
  let last = -1;
  for (const i of [...keep].sort((a, b) => a - b)) {
    if (i !== last + 1) out.push('[…]');
    out.push(numbered(i));
    last = i;
  }
  if (last < lines.length - 1) out.push('[…]');
  return out.join('\n');
}
