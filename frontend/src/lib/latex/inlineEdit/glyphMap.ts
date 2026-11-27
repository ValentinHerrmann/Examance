/** The typeset words of a compile with their exact glyph positions (`main.prov` from the browser engine, `scripts/latex-engine/provenance`) tied to their source through SyncTeX's columns: from a point on the page to a source character, and from a source position to a caret box on the page (issue #347). */
import { MAIN_TAG, type SyncData, type SyncRecord } from '../engine/synctex';
import { printedView } from '../printedText';

/** One native word as shipped: PDF points from the page's top-left corner, `y` the baseline, `glyphs` each glyph's left edge. */
export interface TypesetWord {
  page: number;
  x: number;
  y: number;
  width: number;
  size: number;
  glyphs: number[];
}

/** A position in main.tex as the engine counts it (SyncTeX line, 0-based UTF-16 column). */
export interface TexPos {
  line: number;
  column: number;
}

/** A caret on the page: top-left of a line `height` tall. */
export interface CaretBox {
  page: number;
  x: number;
  top: number;
  height: number;
}

/** A highlighted stretch of one printed line (a selection). */
export interface PageBox {
  page: number;
  x: number;
  top: number;
  width: number;
  height: number;
}

/** Words per page, in shipping order. */
export type GlyphMap = Map<number, TypesetWord[]>;

/** Parses main.prov (`w page h v width size n x1 … xn`, sp) into PDF points with SyncTeX's frame. */
export function parseProv(text: string, frame: Pick<SyncData, 'scale' | 'dx' | 'dy'>): GlyphMap {
  const map: GlyphMap = new Map();
  for (const line of text.split('\n')) {
    if (!line.startsWith('w ')) continue;
    const n = line.slice(2).split(' ').map(Number);
    const [page, h, v, width, size, count] = n;
    if (![page, h, v, width, size, count].every(Number.isFinite)) continue;
    const x = h * frame.scale + frame.dx;
    const word: TypesetWord = {
      page,
      x,
      y: v * frame.scale + frame.dy,
      width: width * frame.scale,
      size: size * frame.scale,
      glyphs: n.slice(6, 6 + count).map((g) => x + g * frame.scale),
    };
    const list = map.get(page) ?? [];
    list.push(word);
    map.set(page, list);
  }
  return map;
}

/** The word for a click at (x, y) on `page`, as in a text editor: the nearest printed line (by baseline), then the nearest word on it; a click right of a line's end gets its last word, left of its start its first. Null only on a page without words. */
export function wordAtPoint(map: GlyphMap, page: number, x: number, y: number): TypesetWord | null {
  const words = map.get(page) ?? [];
  // Distance from the click to the middle of a word's lowercase letters: a larger title on the same printed line does not win over the text beside it.
  const lineDist = (w: TypesetWord) => Math.abs(y - (w.y - w.size * 0.3));
  let lineY: number | null = null;
  let bestLine = Infinity;
  for (const w of words) {
    const d = lineDist(w);
    if (d < bestLine) {
      bestLine = d;
      lineY = w.y;
    }
  }
  if (lineY === null) return null;
  let best: TypesetWord | null = null;
  let bestDist = Infinity;
  for (const w of words) {
    if (Math.abs(w.y - lineY) > 0.5) continue;
    const dist = x < w.x ? w.x - x : Math.max(0, x - (w.x + w.width));
    if (dist < bestDist) {
      bestDist = dist;
      best = w;
    }
  }
  return best;
}

/** The glyph index under `x` in `word` (its left half or right half: `before` true means the caret goes before it). */
export function glyphAt(word: TypesetWord, x: number): { index: number; before: boolean } {
  const n = word.glyphs.length;
  for (let i = 0; i < n; i++) {
    const left = word.glyphs[i];
    const right = i + 1 < n ? word.glyphs[i + 1] : word.x + word.width;
    if (x < right || i === n - 1) return { index: i, before: x < (left + right) / 2 };
  }
  return { index: 0, before: true };
}

/** main.tex separator points (glue, kern, math) with columns on the baseline of `word`, sorted by x: the interword spaces of its printed line. */
function gluesOnLine(sync: SyncData, word: TypesetWord): SyncRecord[] {
  return (sync.pages.get(word.page) ?? [])
    .filter((r) => r.separator && r.tag === MAIN_TAG && r.column >= 0 && Math.abs(r.y - word.y) < 0.5)
    .sort((a, b) => a.x - b.x);
}

/** Whether a source word of `text` can be the typeset `word`: as many glyphs as characters, or a few fewer (ligatures such as fi, tt). */
function fits(word: TypesetWord, text: string): boolean {
  const n = word.glyphs.length;
  return n <= text.length && text.length <= n + 3;
}

/** Where `word` starts in main.tex (a native word is a run without spaces, punctuation included): right after the interword space before it, or (first word of a printed line) right before the space after it, found in `lineText` of that line through its printed view. */
export function wordSource(sync: SyncData, word: TypesetWord, lineOf: (line: number) => string | undefined): { line: number; text: string; at: [number, number][] } | null {
  const glues = gluesOnLine(sync, word);
  const left = glues.filter((g) => g.x <= word.x + 0.01).at(-1);
  if (left) {
    const text = lineOf(left.line);
    if (text !== undefined) {
      const view = printedView([' '.repeat(left.column + 1) + text.slice(left.column + 1)], left.line);
      const m = /\S+/u.exec(view.text);
      if (m && fits(word, m[0])) return { line: left.line, text: m[0], at: view.at.slice(m.index, m.index + m[0].length) };
    }
  }
  const right = glues.find((g) => g.x >= word.x + word.width - 0.01);
  if (right) {
    const text = lineOf(right.line);
    if (text !== undefined) {
      const view = printedView([text.slice(0, right.column)], right.line);
      const m = [...view.text.matchAll(/\S+/gu)].at(-1);
      if (m && fits(word, m[0])) return { line: right.line, text: m[0], at: view.at.slice(m.index, m.index + m[0].length) };
    }
  }
  return null;
}

/** Letter pairs and triples the document fonts set as one glyph (Libertine and the TeX defaults), longest first. */
const LIGATURES = ['---', 'ffi', 'ffl', '--', "''", "``", ',,', '<<', '>>', 'ff', 'fi', 'fl', 'ft', 'fj', 'tt', 'Th', 'st', 'ct'];

/** The first character index of each glyph when `text` is set as `n` glyphs: known ligatures are merged from the left until the counts agree, else the characters are spread evenly. */
export function glyphStarts(text: string, n: number): number[] {
  const starts = [...text].map((_, i) => i);
  if (starts.length === n) return starts;
  const groups: number[] = [];
  let i = 0;
  let surplus = text.length - n;
  while (i < text.length) {
    groups.push(i);
    const lig = surplus > 0 ? LIGATURES.find((l) => l.length - 1 <= surplus && text.startsWith(l, i)) : undefined;
    surplus -= lig ? lig.length - 1 : 0;
    i += lig ? lig.length : 1;
  }
  if (groups.length === n) return groups;
  return Array.from({ length: n }, (_, g) => Math.round((g * text.length) / Math.max(1, n)));
}

/** The source position of glyph `index` of a word whose printed characters `text` sit at `at`. */
export function charOfGlyph(word: TypesetWord, text: string, at: [number, number][], index: number): [number, number] {
  const starts = glyphStarts(text, word.glyphs.length);
  const k = starts[Math.max(0, Math.min(index, starts.length - 1))] ?? 0;
  return at[Math.max(0, Math.min(k, at.length - 1))];
}

const before = (a: TexPos, b: TexPos) => a.line < b.line || (a.line === b.line && a.column <= b.column);

const sources = new WeakMap<TypesetWord, ReturnType<typeof wordSource>>();

function cachedSource(sync: SyncData, word: TypesetWord, lineOf: (line: number) => string | undefined): ReturnType<typeof wordSource> {
  if (!sources.has(word)) sources.set(word, wordSource(sync, word, lineOf));
  return sources.get(word) ?? null;
}

/** The caret before character `index` of `word` (`index` = its length: after the last glyph). */
function caretBox(word: TypesetWord, text: string, index: number): CaretBox {
  // The glyph that starts at or after character `index`; inside a ligature the caret goes before it.
  const g = glyphStarts(text, word.glyphs.length).findIndex((st) => st >= index);
  const x = g < 0 ? word.x + word.width : word.glyphs[g];
  return { page: word.page, x, top: word.y - word.size * 0.8, height: word.size };
}

/** The caret box for main.tex position `pos`: in the typeset word whose source holds it, else after the last word before it (a space, a line end, a macro name), else null (nothing typeset before it). */
export function caretAt(sync: SyncData, map: GlyphMap, pos: TexPos, lineOf: (line: number) => string | undefined): CaretBox | null {
  let after: { word: TypesetWord; text: string; end: TexPos } | null = null;
  for (const word of [...map.values()].flat()) {
    const src = cachedSource(sync, word, lineOf);
    if (!src || src.at.length === 0) continue;
    const [l0, c0] = src.at[0];
    const [l1, c1] = src.at[src.at.length - 1];
    const end = { line: l1, column: c1 + 1 };
    if (before({ line: l0, column: c0 }, pos) && before(pos, end)) {
      const k = src.at.findIndex(([l, c]) => l > pos.line || (l === pos.line && c >= pos.column));
      return caretBox(word, src.text, k < 0 ? src.at.length : k);
    }
    if (before(end, pos) && (!after || before(after.end, end))) after = { word, text: src.text, end };
  }
  return after ? caretBox(after.word, after.text, after.text.length) : null;
}

/** The selected stretch of `word` between `from` and `to` (exclusive) as left and right x, or null when none of it is selected. */
function selectedPart(word: TypesetWord, src: NonNullable<ReturnType<typeof wordSource>>, from: TexPos, to: TexPos): [number, number] | null {
  const inside = src.at.map(([line, column]) => before(from, { line, column }) && !before(to, { line, column }) && !(to.line === line && to.column === column));
  const first = inside.indexOf(true);
  if (first < 0) return null;
  const last = inside.lastIndexOf(true);
  const starts = glyphStarts(src.text, word.glyphs.length);
  let g0 = 0;
  while (g0 + 1 < starts.length && starts[g0 + 1] <= first) g0++;
  const g1 = starts.findIndex((st) => st > last);
  return [word.glyphs[g0], g1 < 0 ? word.x + word.width : word.glyphs[g1]];
}

/** The boxes of the typeset text between main.tex positions `from` and `to` (exclusive), one per printed line: from the first selected glyph to the end of the last one, spaces between included. */
export function selectionBoxes(sync: SyncData, map: GlyphMap, from: TexPos, to: TexPos, lineOf: (line: number) => string | undefined): PageBox[] {
  const rows = new Map<string, PageBox>();
  for (const word of [...map.values()].flat()) {
    const src = cachedSource(sync, word, lineOf);
    const part = src && selectedPart(word, src, from, to);
    if (!part) continue;
    const [x0, x1] = part;
    const key = `${word.page}:${word.y.toFixed(1)}`;
    const row = rows.get(key);
    if (row) {
      const right = Math.max(row.x + row.width, x1);
      row.x = Math.min(row.x, x0);
      row.width = right - row.x;
    } else rows.set(key, { page: word.page, x: x0, top: word.y - word.size * 0.8, width: x1 - x0, height: word.size });
  }
  return [...rows.values()];
}
