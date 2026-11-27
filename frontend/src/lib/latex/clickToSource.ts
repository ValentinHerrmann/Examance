/** From a click on a compiled preview to the exercise's LaTeX, and from an edited line back to the page (issue #347). With the browser engine every typeset character knows its source position (`inlineEdit/glyphMap.ts`); for other results SyncTeX gives the line, pdf.js the clicked word and its neighbours, the paragraph's printed view (`printedText.ts`) the column; `docs/dev/latex.md`. */
import { loadPdfjs } from '#lib/pdf/pdfjs';
import type { CompileResult } from './compiler';
import { parseSynctex, sourceAt, type SyncData } from './engine/synctex';
import { caretAt, charAtX, checkSources, hasSource, parseProv, provHasChars, selectionBoxes, sourceAt as charSource, wordAtPoint, wordBefore, wordByText, type CaretBox, type GlyphMap, type PageBox } from './inlineEdit/glyphMap';
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

/** What the pages draw for the editor's cursor: the caret and the selection boxes, PDF points from each page's top-left corner. */
export interface PageMarks {
  caret: CaretBox | null;
  boxes: PageBox[];
  /** Bumped when the caret moved through a click in the code editor: the page caret pulses once. */
  flash?: number;
}

/** A point on a page: 1-based page, PDF points from its top-left corner. */
export type PagePoint = Pick<PageClick, 'page' | 'x' | 'y'>;

export type ClickTarget =
  | { kind: 'source'; exerciseId: string | null; label: string; line: number; column: number }
  | { kind: 'template' };

/** What a lookup needs from a compile; a result without SyncTeX (a reloaded cache entry) cannot be clicked. */
export type SyncedResult = Pick<CompileResult, 'pdfBytes' | 'synctex' | 'synctexLineShift' | 'synctexColumns' | 'provenance' | 'sourceRanges'>;

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
  /** Index of the clicked character in `word`. */
  offset?: number;
}

const parsed = new WeakMap<Uint8Array, SyncData>();

function syncDataOf(result: SyncedResult): SyncData | null {
  const bytes = result.synctex;
  if (!bytes) return null;
  let data = parsed.get(bytes);
  if (!data) {
    data = parseSynctex(new TextDecoder().decode(bytes), result.synctexColumns === true);
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
  click: PagePoint,
  probe: WordProbe | null,
  bodyOf: (exerciseId: string | null) => string | undefined
): ClickTarget | null {
  const data = syncDataOf(result);
  const ranges = result.sourceRanges;
  if (!data || !ranges) return null;
  // Text by the engine's positions; then the word the PDF shows there, among the engine's transformed words (TikZ labels); with no word there at all, the nearest line, as in a text editor.
  const exact = glyphTarget(result, click, bodyOf) ?? (probe ? probeTarget(result, data, click.page, probe, bodyOf) : glyphTarget(result, click, bodyOf, false));
  if (exact) return exact;
  const hit = sourceAt(data, click.page, click.x, click.y);
  if (!hit) return null;
  // Package and template files (sty/…) are never the exercise.
  if (!hit.file.endsWith(MAIN_FILE)) return { kind: 'template' };
  const docLine = documentLine(result, hit.line);
  const loc = mapLine({ tex: '', ranges }, docLine);
  if (loc?.label) {
    const body = bodyOf(loc.exerciseId);
    if (body === undefined) return { kind: 'template' };
    const lines = body.split('\n');
    const { line, column } = locateWord(lines, loc.line, probe);
    return { kind: 'source', exerciseId: loc.exerciseId, label: loc.label, line, column: charColumn(lines[line - 1] ?? '', column, probe) };
  }
  return runInStart(ranges, docLine, probe, bodyOf) ?? { kind: 'template' };
}

const glyphMaps = new WeakMap<Uint8Array, GlyphMap | null>();

/** The engine's glyph map, or null for results without it (server compiles, engines before character positions). */
function glyphMapOf(result: SyncedResult, data: SyncData): GlyphMap | null {
  const bytes = result.provenance;
  if (!bytes || !result.synctexColumns) return null;
  let map = glyphMaps.get(bytes);
  if (map === undefined) {
    const text = new TextDecoder().decode(bytes);
    map = provHasChars(text) ? parseProv(text, data) : null;
    glyphMaps.set(bytes, map);
  }
  return map;
}

const checked = new WeakSet<GlyphMap>();

/** The glyph map with only the character positions the compiled bodies confirm (`checkSources`); checked once per result, so `bodyOf` must give the text it was compiled from. */
function checkedMapOf(result: SyncedResult, data: SyncData, bodyOf: (exerciseId: string | null) => string | undefined): GlyphMap | null {
  const map = glyphMapOf(result, data);
  if (!map || checked.has(map)) return map;
  const lineOf = lineReader(result, bodyOf);
  checkSources(map, (pos) => {
    const text = lineOf(pos.line);
    return text === undefined ? undefined : (text[pos.column] ?? null);
  });
  checked.add(map);
  return map;
}

/** The text of main.tex line `line` (the engine's numbering) when it lies in an exercise body; template lines are not known here. */
function lineReader(result: SyncedResult, bodyOf: (exerciseId: string | null) => string | undefined): (line: number) => string | undefined {
  const bodies = new Map<string | null, string[] | undefined>();
  return (line) => {
    const loc = mapLine({ tex: '', ranges: result.sourceRanges ?? [] }, documentLine(result, line));
    if (!loc?.label) return undefined;
    if (!bodies.has(loc.exerciseId)) bodies.set(loc.exerciseId, bodyOf(loc.exerciseId)?.split('\n'));
    return bodies.get(loc.exerciseId)?.[loc.line - 1];
  };
}

/** Whether this result has exact glyph and character positions (the browser engine): clicks need no text extraction and the caret can be drawn. */
export function hasGlyphs(result: SyncedResult | null | undefined): boolean {
  if (!result?.provenance || !result.synctexColumns || !result.synctex || !result.sourceRanges) return false;
  const data = syncDataOf(result);
  return Boolean(data && glyphMapOf(result, data));
}

/** The clicked character from the engine's positions: the caret before the character under the click, or after it on its right half. With `near` only for a click on or beside a printed line (not on a figure). Null when there is no such word or it has no confirmed position (formulas, template text): the caller then reads the word from the PDF. */
export function glyphTarget(result: SyncedResult, click: PagePoint, bodyOf: (exerciseId: string | null) => string | undefined, near = true): ClickTarget | null {
  const data = syncDataOf(result);
  const map = data && checkedMapOf(result, data, bodyOf);
  let word = map && wordAtPoint(map, click.page, click.x, click.y, near);
  if (!map || !word) return null;
  let pos;
  if (!hasSource(word) && word.glyphs.length === 1 && wordBefore(map, word)) {
    // The hyphen of a word broken at the line end: the end of that word.
    word = wordBefore(map, word) as NonNullable<typeof word>;
    pos = charSource(word, word.chars.length - 1, false);
  } else {
    const hit = charAtX(word, click.x);
    pos = charSource(word, hit.index, hit.before);
  }
  if (!pos) return null;
  const loc = mapLine({ tex: '', ranges: result.sourceRanges ?? [] }, documentLine(result, pos.line));
  if (!loc?.label) return { kind: 'template' };
  return { kind: 'source', exerciseId: loc.exerciseId, label: loc.label, line: loc.line, column: pos.column };
}

/** The word read from the PDF (`probe`) among the engine's transformed words (TikZ nodes, whose positions TeX does not know): their characters still know their source. */
function probeTarget(result: SyncedResult, data: SyncData, page: number, probe: WordProbe, bodyOf: (exerciseId: string | null) => string | undefined): ClickTarget | null {
  const map = checkedMapOf(result, data, bodyOf);
  const word = map && wordByText(map, page, probe.word, probe.before);
  const pos = word && charSource(word, Math.min(probe.offset ?? 0, word.chars.length - 1), true);
  if (!pos) return null;
  const loc = mapLine({ tex: '', ranges: result.sourceRanges ?? [] }, documentLine(result, pos.line));
  return loc?.label ? { kind: 'source', exerciseId: loc.exerciseId, label: loc.label, line: loc.line, column: pos.column } : null;
}

/** The highlight boxes of a selection in exercise `exerciseId` between body positions `from` and `to` (1-based lines, any order). */
export function selectionFor(
  result: SyncedResult,
  exerciseId: string | null,
  from: { line: number; column: number },
  to: { line: number; column: number },
  bodyOf: (exerciseId: string | null) => string | undefined
): PageBox[] {
  const data = syncDataOf(result);
  const map = data && checkedMapOf(result, data, bodyOf);
  const range = rangeOf(result, exerciseId);
  if (!data || !map || !range) return [];
  const shift = range.start - 1 + (result.synctexLineShift ?? 0);
  const a = { line: from.line + shift, column: from.column };
  const b = { line: to.line + shift, column: to.column };
  const [lo, hi] = a.line < b.line || (a.line === b.line && a.column <= b.column) ? [a, b] : [b, a];
  return selectionBoxes(map, lo, hi);
}

/** Where the caret of exercise `exerciseId` at body `line` (1-based) and `column` shows on the page, or null when nothing of that body is typeset before it. */
export function caretFor(result: SyncedResult, exerciseId: string | null, line: number, column: number, bodyOf: (exerciseId: string | null) => string | undefined): CaretBox | null {
  const data = syncDataOf(result);
  const map = data && checkedMapOf(result, data, bodyOf);
  const range = rangeOf(result, exerciseId);
  if (!data || !map || !range) return null;
  const shift = range.start - 1 + (result.synctexLineShift ?? 0);
  // Only text of this body: before its first character the caret has nowhere to go.
  return caretAt(map, { line: line + shift, column }, (l) => l >= 1 + shift);
}

/** The column of the clicked character in a word found at `column` of `source`: its `probe.offset`-th printed character (macros in the word included), or the word start. */
function charColumn(source: string, column: number, probe: WordProbe | null): number {
  if (!probe?.offset) return column;
  const view = printedView([source.slice(0, column).replace(/[^\n]/g, ' ') + source.slice(column)]);
  const start = view.text.search(/[\p{L}\p{N}]/u);
  return start < 0 ? column : (view.at[start + probe.offset]?.[1] ?? column);
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
  return startsThere
    ? { kind: 'source', exerciseId: range.exerciseId, label: range.label, line: found.line, column: charColumn(lines[found.line - 1] ?? '', found.column, probe) }
    : null;
}

/** The range of the exercise `exerciseId`, or the only range when the document marks one body. */
export function rangeOf(result: SyncedResult, exerciseId: string | null): SourceRange | undefined {
  const ranges = result.sourceRanges ?? [];
  return exerciseId === null && ranges.length === 1 ? ranges[0] : ranges.find((r) => r.exerciseId === exerciseId);
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
  return { word: line.text.slice(span.from, span.to), before, after, offset: Math.max(0, Math.min(nearest, span.to - 1) - span.from) };
}

/** The word under the click, or null (an image, a rule, empty space, a PDF pdf.js cannot read). */
export async function wordAt(pdfBytes: Uint8Array, click: PagePoint): Promise<WordProbe | null> {
  try {
    const page = await (await docOf(pdfBytes)).getPage(click.page);
    const [left, , , top] = page.view;
    const content = await page.getTextContent();
    return wordInItems(content.items as TextItemLike[], top, click.x + left, click.y);
  } catch {
    return null;
  }
}
