/** From a click on a compiled preview to the exercise's LaTeX, and from an edited line back to the page (issue #347). SyncTeX gives the line, pdf.js the clicked word, `columnOf` the column; `docs/dev/latex.md`. */
import { loadPdfjs } from '#lib/pdf/pdfjs';
import type { CompileResult } from './compiler';
import { columnOf, parseSynctex, positionOf, sourceAt, type SyncData } from './engine/synctex';
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
/** Neighbouring lines tried when the clicked word is not on the line SyncTeX names (multi-line paragraphs, math, table cells). */
const NEIGHBOUR_LINES = 2;

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

/** Column of `word` on `line` of `lines` (1-based), else on the nearest neighbouring line of the same body. */
export function locateWord(lines: string[], line: number, word: string | null): { line: number; column: number } {
  if (!word) return { line, column: 0 };
  for (let d = 0; d <= NEIGHBOUR_LINES; d++) {
    for (const candidate of d === 0 ? [line] : [line - d, line + d]) {
      if (candidate < 1 || candidate > lines.length) continue;
      const column = columnOf(lines[candidate - 1], word);
      if (column >= 0) return { line: candidate, column };
    }
  }
  return { line, column: 0 };
}

/** Where the click lands in the source: an exercise line and column, the template, or null when SyncTeX knows nothing there. `bodyOf` returns the LaTeX body of a marked exercise (by id, or the only one when the builder gave none). */
export function resolveClick(
  result: SyncedResult,
  click: Pick<PageClick, 'page' | 'x' | 'y'>,
  word: string | null,
  bodyOf: (exerciseId: string | null) => string | undefined
): ClickTarget | null {
  const data = syncDataOf(result);
  const ranges = result.sourceRanges;
  if (!data || !ranges) return null;
  const hit = sourceAt(data, click.page, click.x, click.y);
  if (!hit) return null;
  // Package and template files (sty/…) are never the exercise.
  if (!hit.file.endsWith(MAIN_FILE)) return { kind: 'template' };
  const loc = mapLine({ tex: '', ranges }, documentLine(result, hit.line));
  if (!loc?.label) return { kind: 'template' };
  const body = bodyOf(loc.exerciseId);
  if (body === undefined) return { kind: 'template' };
  const { line, column } = locateWord(body.split('\n'), loc.line, word);
  return { kind: 'source', exerciseId: loc.exerciseId, label: loc.label, line, column };
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

/** The word under (x, y) in the page's text items, PDF points from the top-left; `pageHeight` turns pdf.js's bottom-left baseline into that frame. */
export function wordInItems(items: TextItemLike[], pageHeight: number, x: number, y: number): string | null {
  const baseline = pageHeight - y;
  for (const item of items) {
    if (!item.str.trim() || item.width <= 0) continue;
    const left = item.transform[4];
    const bottom = item.transform[5];
    const height = item.height || Math.abs(item.transform[3]) || 10;
    if (x < left || x > left + item.width || baseline < bottom - height * 0.3 || baseline > bottom + height) continue;
    const at = Math.min(item.str.length - 1, Math.max(0, Math.floor(((x - left) / item.width) * item.str.length)));
    return wordAround(item.str, at);
  }
  return null;
}

function wordAround(text: string, at: number): string | null {
  const isWord = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);
  if (!isWord(text[at])) return null;
  let from = at;
  let to = at;
  while (isWord(text[from - 1])) from--;
  while (isWord(text[to + 1])) to++;
  return text.slice(from, to + 1);
}

/** The word under the click, or null (an image, a rule, empty space, a PDF pdf.js cannot read). */
export async function wordAt(pdfBytes: Uint8Array, click: Pick<PageClick, 'page' | 'x' | 'y'>): Promise<string | null> {
  try {
    const page = await (await docOf(pdfBytes)).getPage(click.page);
    const [left, , , top] = page.view;
    const content = await page.getTextContent();
    return wordInItems(content.items as TextItemLike[], top, click.x + left, click.y);
  } catch {
    return null;
  }
}
