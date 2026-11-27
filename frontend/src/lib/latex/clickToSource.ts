/** From a click on a compiled preview to the exercise's LaTeX, and from an edited line back to the page (issue #347). SyncTeX gives the line, pdf.js the clicked word and its neighbours, the paragraph's printed view (`printedText.ts`) the column; `docs/dev/latex.md`. */
import { loadPdfjs } from '#lib/pdf/pdfjs';
import type { CompileResult } from './compiler';
import { parseSynctex, positionOf, sourceAt, type SyncData } from './engine/synctex';
import { normalizePrinted, printedView, wordSpan, wordsOf } from './printedText';
import { mapLine, type SourceRange } from './sourceMap';

/** A click on a page: 1-based page, PDF points from the page's top-left corner, plus the screen point for a tooltip. */
export interface PageClick {
  page: number;
  x: number;
  y: number;
  clientX: number;
  clientY: number;
}

/** Text drawn over the shown page until the next PDF arrives, in the same coordinates as `PageClick`. */
export interface PageOverlay {
  page: number;
  x: number;
  y: number;
  text: string;
}

export type ClickTarget =
  | { kind: 'source'; exerciseId: string | null; label: string; line: number; column: number }
  | { kind: 'template' };

/** What a lookup needs from a compile; a result without SyncTeX (a reloaded cache entry) cannot be clicked. */
export type SyncedResult = Pick<CompileResult, 'pdfBytes' | 'synctex' | 'synctexLineShift' | 'sourceRanges'>;

/** Lines the SyncTeX reader resolves against: the document is always fed in as main.tex. */
const MAIN_FILE = 'main.tex';
/** How far the search for the clicked word reaches around SyncTeX's line: the paragraph, at most this many lines each way. */
const PARAGRAPH_REACH = 40;
/** Neighbouring words compared on each side to choose between occurrences of the same word. */
const CONTEXT_WORDS = 3;

/** The clicked word as printed, with up to `CONTEXT_WORDS` words before and after it on its printed line. */
export interface WordProbe {
  word: string;
  before: string[];
  after: string[];
}

const parsed = new WeakMap<Uint8Array, SyncData>();

function syncDataOf(result: SyncedResult): SyncData | null {
  const bytes = result.synctex;
  if (!bytes) return null;
  let data = parsed.get(bytes);
  if (!data) {
    data = parseSynctex(new TextDecoder().decode(bytes));
    parsed.set(bytes, data);
  }
  return data;
}

/** Whether clicks on this result can be resolved at all. */
export function isClickable(result: SyncedResult | null | undefined): boolean {
  return Boolean(result?.synctex && result.sourceRanges);
}

/** The line of the document as built (marker-free), from a SyncTeX line of the file the engine compiled. */
function documentLine(result: SyncedResult, synctexLine: number): number {
  const shift = result.synctexLineShift ?? 0;
  return synctexLine > shift ? synctexLine - shift : synctexLine;
}

/** The paragraph around `line` (1-based) of `lines`: from the blank line before to the blank line after, at most `PARAGRAPH_REACH` lines each way. */
function paragraphOf(lines: string[], line: number): { first: number; last: number } {
  const blank = (n: number) => !lines[n - 1]?.trim();
  let first = line;
  let last = line;
  while (first > 1 && !blank(first - 1) && line - first < PARAGRAPH_REACH) first--;
  while (last < lines.length && !blank(last + 1) && last - line < PARAGRAPH_REACH) last++;
  return { first, last };
}

/** How many of the probe's neighbours match the printed words around occurrence `i`. */
function contextScore(words: string[], i: number, probe: WordProbe): number {
  let score = 0;
  probe.before.forEach((w, k) => {
    if (words[i - probe.before.length + k] === w) score++;
  });
  probe.after.forEach((w, k) => {
    if (words[i + 1 + k] === w) score++;
  });
  return score;
}

/** Line and column of the clicked word in `lines`, searched in the paragraph around `line` (SyncTeX's line): occurrences are ranked by matching neighbours, then by nearness to that line; column 0 of `line` when the word is not there. */
export function locateWord(lines: string[], line: number, probe: WordProbe | null): { line: number; column: number } {
  if (!probe?.word || line < 1 || line > lines.length) return { line, column: 0 };
  const { first, last } = paragraphOf(lines, line);
  const view = printedView(lines.slice(first - 1, last), first);
  const starts: number[] = [];
  const words: string[] = [];
  for (const m of view.text.matchAll(/[\p{L}\p{N}]+/gu)) {
    starts.push(m.index);
    words.push(m[0]);
  }
  // A word hyphenated at the end of a printed line shows only its first part.
  const matches = (w: string) => w === probe.word || (probe.word.length >= 3 && w.startsWith(probe.word) && probe.after.length === 0);
  let best = -1;
  let bestScore = -Infinity;
  words.forEach((w, i) => {
    if (!matches(w)) return;
    const [at] = view.at[starts[i]];
    const score = contextScore(words, i, probe) * 10 - Math.abs(at - line) * 0.1 - (w === probe.word ? 0 : 5);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  if (best < 0) return { line, column: 0 };
  const [l, column] = view.at[starts[best]];
  return { line: l, column };
}

/** Where the click lands in the source: an exercise line and column, the template, or null when SyncTeX knows nothing there. `bodyOf` returns the LaTeX body of a marked exercise (by id, or the only one when the builder gave none). */
export function resolveClick(
  result: SyncedResult,
  click: Pick<PageClick, 'page' | 'x' | 'y'>,
  probe: WordProbe | null,
  bodyOf: (exerciseId: string | null) => string | undefined
): ClickTarget | null {
  const data = syncDataOf(result);
  const ranges = result.sourceRanges;
  if (!data || !ranges) return null;
  const hit = sourceAt(data, click.page, click.x, click.y);
  if (!hit) return null;
  // Package and template files (sty/…) are never the exercise.
  if (!hit.file.endsWith(MAIN_FILE)) return { kind: 'template' };
  const docLine = documentLine(result, hit.line);
  const loc = mapLine({ tex: '', ranges }, docLine);
  if (loc?.label) {
    const body = bodyOf(loc.exerciseId);
    if (body === undefined) return { kind: 'template' };
    const { line, column } = locateWord(body.split('\n'), loc.line, probe);
    return { kind: 'source', exerciseId: loc.exerciseId, label: loc.label, line, column };
  }
  return runInStart(ranges, docLine, probe, bodyOf) ?? { kind: 'template' };
}

/** Lines between a template line and the exercise body it shares a printed line with (a run-in title, `\begin{Aufgabe}{…}` before the body). */
const RUN_IN_LINES = 3;

/** A template hit whose printed line continues into an exercise body that starts just below it: the clicked word, when that body's first lines hold it. */
function runInStart(
  ranges: SourceRange[],
  docLine: number,
  probe: WordProbe | null,
  bodyOf: (exerciseId: string | null) => string | undefined
): ClickTarget | null {
  const range = ranges.find((r) => r.start > docLine && r.start - docLine <= RUN_IN_LINES);
  const body = range && bodyOf(range.exerciseId);
  if (!range || body === undefined || !probe) return null;
  const lines = body.split('\n');
  const found = locateWord(lines, 1, probe);
  // locateWord answers column 0 of the given line when the word is missing; accept that only when the word really starts there.
  const startsThere = found.column > 0 || found.line > 1 || printedView([lines[0] ?? '']).text.trimStart().startsWith(probe.word);
  return startsThere ? { kind: 'source', exerciseId: range.exerciseId, label: range.label, line: found.line, column: found.column } : null;
}

/** Where line `line` (1-based) of the marked body `range` was typeset, for the provisional overlay. */
export function placeOfLine(result: SyncedResult, range: SourceRange, line: number): Omit<PageOverlay, 'text'> | null {
  const data = syncDataOf(result);
  if (!data) return null;
  const docLine = range.start + line - 1;
  const shift = result.synctexLineShift ?? 0;
  return positionOf(data, MAIN_FILE, docLine + shift) ?? positionOf(data, MAIN_FILE, docLine);
}

/** The range of the exercise `exerciseId`, or the only range when the document marks one body. */
export function rangeOf(result: SyncedResult, exerciseId: string | null): SourceRange | undefined {
  const ranges = result.sourceRanges ?? [];
  return exerciseId === null && ranges.length === 1 ? ranges[0] : ranges.find((r) => r.exerciseId === exerciseId);
}

/** The text typed into `now` compared with `before` (the line as last compiled): the part between their common prefix and suffix. */
export function insertedText(before: string, now: string): string {
  let start = 0;
  while (start < before.length && start < now.length && before[start] === now[start]) start++;
  let end = 0;
  while (end < before.length - start && end < now.length - start && before[before.length - 1 - end] === now[now.length - 1 - end]) end++;
  return now.slice(start, now.length - end);
}

// --- the clicked word, through pdf.js ---------------------------------------------------------

type Pdfjs = Awaited<ReturnType<typeof loadPdfjs>>;
type LoadingTask = ReturnType<Pdfjs['getDocument']>;
type PdfDoc = Awaited<LoadingTask['promise']>;
/** The last few previews' documents (Angabe, Lösung, exam): pdf.js keeps each one in its worker until its task is destroyed. */
const MAX_DOCS = 4;
const docs = new Map<Uint8Array, Promise<LoadingTask>>();

function docOf(pdfBytes: Uint8Array): Promise<PdfDoc> {
  let task = docs.get(pdfBytes);
  if (task) {
    docs.delete(pdfBytes);
  } else {
    // pdf.js takes over the buffer it is given: hand it a copy, the bytes stay in the compile cache.
    task = loadPdfjs().then((pdfjs) => pdfjs.getDocument({ data: pdfBytes.slice() }));
  }
  docs.set(pdfBytes, task);
  while (docs.size > MAX_DOCS) {
    const [oldest, old] = docs.entries().next().value as [Uint8Array, Promise<LoadingTask>];
    docs.delete(oldest);
    void old.then((t) => t.destroy(), () => undefined);
  }
  return task.then((t) => t.promise);
}

interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/** Rough advance of a character relative to the average, so a click inside a long pdf.js item finds the right character in a proportional font. */
function charWeight(c: string): number {
  if (/[iljt.,:;'!|]/.test(c) || c === ' ') return 0.55;
  if (/[-frI()]/.test(c)) return 0.7;
  if (/[mwMW]/.test(c)) return 1.5;
  if (/[A-ZÄÖÜ]/.test(c)) return 1.25;
  return 1;
}

/** The printed line under (x, y), PDF points from the top-left: its items on that baseline in reading order joined into one string, with each character's estimated centre x. `pageHeight` turns pdf.js's bottom-left baselines into that frame. */
function lineAt(items: TextItemLike[], pageHeight: number, x: number, y: number): { text: string; xs: number[] } | null {
  const baseline = pageHeight - y;
  const hit = items.find((item) => {
    if (!item.str.trim() || item.width <= 0) return false;
    const height = item.height || Math.abs(item.transform[3]) || 10;
    const bottom = item.transform[5];
    return baseline >= bottom - height * 0.3 && baseline <= bottom + height && x >= item.transform[4] - 2 && x <= item.transform[4] + item.width + 2;
  });
  if (!hit) return null;
  const tolerance = (hit.height || 10) * 0.3;
  const row = items
    .filter((item) => item.str && Math.abs(item.transform[5] - hit.transform[5]) <= tolerance)
    .sort((a, b) => a.transform[4] - b.transform[4]);
  let text = '';
  const xs: number[] = [];
  for (const item of row) {
    const str = normalizePrinted(item.str);
    if (text && !text.endsWith(' ') && !str.startsWith(' ')) {
      text += ' ';
      xs.push(item.transform[4]);
    }
    const total = [...str].reduce((sum, c) => sum + charWeight(c), 0) || 1;
    let left = item.transform[4];
    for (const c of str) {
      const w = (charWeight(c) / total) * item.width;
      text += c;
      xs.push(left + w / 2);
      left += w;
    }
  }
  return { text, xs };
}

/** The word under (x, y) with its neighbours on the printed line, or null off the text; on a space or punctuation, the nearest word. */
export function wordInItems(items: TextItemLike[], pageHeight: number, x: number, y: number): WordProbe | null {
  const line = lineAt(items, pageHeight, x, y);
  if (!line) return null;
  let nearest = 0;
  line.xs.forEach((cx, i) => {
    if (Math.abs(cx - x) < Math.abs(line.xs[nearest] - x)) nearest = i;
  });
  const span = wordSpan(line.text, nearest);
  if (!span) return null;
  const before = wordsOf(line.text.slice(0, span.from)).slice(-CONTEXT_WORDS);
  const after = wordsOf(line.text.slice(span.to)).slice(0, CONTEXT_WORDS);
  return { word: line.text.slice(span.from, span.to), before, after };
}

/** The word under the click, or null (an image, a rule, empty space, a PDF pdf.js cannot read). */
export async function wordAt(pdfBytes: Uint8Array, click: Pick<PageClick, 'page' | 'x' | 'y'>): Promise<WordProbe | null> {
  try {
    const page = await (await docOf(pdfBytes)).getPage(click.page);
    const [left, , , top] = page.view;
    const content = await page.getTextContent();
    return wordInItems(content.items as TextItemLike[], top, click.x + left, click.y);
  } catch {
    return null;
  }
}
