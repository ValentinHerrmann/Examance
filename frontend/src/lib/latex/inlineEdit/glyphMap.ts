/** The typeset words of a compile with their exact glyph positions, each character's place in main.tex and each glyph's characters (`main.prov` from the browser engine, `scripts/latex-engine/provenance`): from a point on the page to a source character, and from a source position to a caret box on the page (issue #347). */
import type { SyncData } from '../engine/synctex';

/** One native word as shipped: PDF points from the page's top-left corner, `y` the baseline, `glyphs` each glyph's left edge; `chars` each UTF-16 character's main.tex position (null: none, e.g. template text or a hyphen), `clusters` each glyph's first character (HarfBuzz), absent when shaping kept none, `text` its characters. */
export interface TypesetWord {
  page: number;
  x: number;
  y: number;
  width: number;
  size: number;
  glyphs: number[];
  chars: (TexPos | null)[];
  clusters: number[] | null;
  text: string;
  /** Inside content dvipdfmx transforms (TikZ nodes, rotated boxes): not where TeX put it, so only its text and source count. */
  transformed: boolean;
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

/** A packed provenance value (line*4096+column) as a position; 0 and column 4095 (template code) are none. */
function unpack(v: number): TexPos | null {
  if (!Number.isFinite(v) || v <= 0) return null;
  const column = v % 4096;
  return column === 4095 ? null : { line: Math.floor(v / 4096), column };
}

/** Whether main.prov has the characters, their positions and the clusters (engines before them wrote glyph positions only). */
export function provHasChars(text: string): boolean {
  const first = text.indexOf('w ');
  return first >= 0 && text.slice(first, text.indexOf('\n', first)).split(' |').length >= 4;
}

/** Parses main.prov (`w page h v width size n x1 … xn | m p1 … pm | c1 … cn | u1 … um | t`, sp; `u` the characters as UTF-16 units, `t` 1 inside content dvipdfmx transforms) into PDF points with SyncTeX's frame. Transformed words (TikZ nodes, rotated boxes) do not show where TeX put them: they take no clicks by position and draw no caret, and only `wordByText` finds them. */
export function parseProv(text: string, frame: Pick<SyncData, 'scale' | 'dx' | 'dy'>): GlyphMap {
  const map: GlyphMap = new Map();
  for (const line of text.split('\n')) {
    if (!line.startsWith('w ')) continue;
    const [glyphPart, charPart = '', clusterPart = '', textPart = '', transformed = ''] = line.slice(2).split(' |');
    const n = glyphPart.split(' ').map(Number);
    const [page, h, v, width, size, count] = n;
    if (![page, h, v, width, size, count].every(Number.isFinite)) continue;
    const x = h * frame.scale + frame.dx;
    const cs = charPart.trim().split(' ').map(Number);
    const clusters = clusterPart.trim() ? clusterPart.trim().split(' ').map(Number) : [];
    const word: TypesetWord = {
      page,
      x,
      y: v * frame.scale + frame.dy,
      width: width * frame.scale,
      size: size * frame.scale,
      glyphs: n.slice(6, 6 + count).map((g) => x + g * frame.scale),
      chars: cs.slice(1, 1 + (cs[0] || 0)).map(unpack),
      clusters: clusters.length === count && clusters.every((c, i) => c >= 0 && (i === 0 || c >= clusters[i - 1])) ? clusters : null,
      text: String.fromCodePoint(...(textPart.trim() ? textPart.trim().split(' ').map(Number) : [])),
      transformed: transformed.trim() === '1',
    };
    const list = map.get(page) ?? [];
    list.push(word);
    map.set(page, list);
  }
  return map;
}

/** The word for a click at (x, y) on `page`, as in a text editor: the nearest printed line (by baseline), then the nearest word on it; a click right of a line's end gets its last word, left of its start its first. With `near`, only when the click is within a line height of that line (a click on a figure is not a click beside the text). Null on a page without words. */
export function wordAtPoint(map: GlyphMap, page: number, x: number, y: number, near = false): TypesetWord | null {
  const words = (map.get(page) ?? []).filter((w) => !w.transformed);
  // Distance from the click to the middle of a word's lowercase letters: a larger title on the same printed line does not win over the text beside it.
  const lineDist = (w: TypesetWord) => Math.abs(y - (w.y - w.size * 0.3));
  let lineY: number | null = null;
  let bestLine = Infinity;
  let lineSize = 0;
  for (const w of words) {
    const d = lineDist(w);
    if (d < bestLine) {
      bestLine = d;
      lineY = w.y;
      lineSize = w.size;
    }
  }
  if (lineY === null || (near && bestLine > lineSize)) return null;
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

/** The first character of each glyph: HarfBuzz's clusters, or the characters spread evenly when there are none. */
function glyphStarts(word: TypesetWord): number[] {
  const n = word.glyphs.length;
  const len = word.chars.length;
  return word.clusters ?? Array.from({ length: n }, (_, g) => Math.round((g * len) / Math.max(1, n)));
}

/** The x of the left edge of character `i` (`i` = length: the word's right edge); a ligature's characters share its width evenly. */
export function charX(word: TypesetWord, i: number): number {
  const len = word.chars.length;
  const n = word.glyphs.length;
  if (i >= len || n === 0) return word.x + word.width;
  const starts = glyphStarts(word);
  let g = 0;
  while (g + 1 < n && starts[g + 1] <= i) g++;
  const end = g + 1 < n ? starts[g + 1] : len;
  const left = word.glyphs[g];
  const right = g + 1 < n ? word.glyphs[g + 1] : word.x + word.width;
  return left + ((right - left) * (i - starts[g])) / Math.max(1, end - starts[g]);
}

/** The character under `x` in `word`, and whether `x` is on its left half (the caret goes before it). */
export function charAtX(word: TypesetWord, x: number): { index: number; before: boolean } {
  const len = word.chars.length;
  for (let i = 0; i < len; i++) {
    const left = charX(word, i);
    const right = charX(word, i + 1);
    if (x < right || i === len - 1) return { index: i, before: x < (left + right) / 2 };
  }
  return { index: 0, before: true };
}

/** The source position for a caret at character `index` of `word` (`before` it, else after it), from the nearest character there with a source: a space or hyphen without one gives the end of the character before it, or the start of the one after it. */
export function sourceAt(word: TypesetWord, index: number, before: boolean): TexPos | null {
  const own = word.chars[index];
  if (own) return before ? own : afterChar(word, index);
  for (let i = index - 1; i >= 0; i--) if (word.chars[i]) return afterChar(word, i);
  for (let i = index + 1; i < word.chars.length; i++) if (word.chars[i]) return word.chars[i];
  return null;
}

/** The position right after character `i`: the next character's own position when it follows in the same source line (a mapped `--` keeps its extent), else one column on. */
function afterChar(word: TypesetWord, i: number): TexPos {
  const own = word.chars[i] as TexPos;
  const next = word.chars[i + 1];
  return next?.line === own.line && next.column > own.column ? next : { line: own.line, column: own.column + 1 };
}

/** Characters TeX's input ligatures (`tex-text`) and `~` turn into others, with the source characters they come from. */
const TYPESET_FROM: Record<string, string> = { '\u2013': '-', '\u2014': '-', '\u201C': '`', '\u2018': '`', '\u201D': "'", '\u2019': "'", '\u201E': ',', '\u00AB': '<', '\u00BB': '>', '\u00A1': '!', '\u00BF': '?', '\u00A0': '~' };

/** Keeps only the character positions that the source confirms: `sourceChar(pos)` gives main.tex's character there (undefined outside exercise bodies, which stay as they are). Text that macros rebuild while expanding (TikZ node labels, `\uppercase`) gets the position of whatever was read at the time, which this drops. */
export function checkSources(map: GlyphMap, sourceChar: (pos: TexPos) => string | undefined | null): void {
  for (const words of map.values()) {
    for (const word of words) {
      if (word.text.length !== word.chars.length) continue;
      word.chars = word.chars.map((pos, i) => {
        if (!pos) return null;
        const src = sourceChar(pos);
        if (src === undefined) return pos;
        const typeset = word.text[i];
        return src === typeset || TYPESET_FROM[typeset] === src ? pos : null;
      });
    }
  }
}

/** The transformed word on `page` whose text is `text` (a word read from the PDF), the one whose preceding words match `before` best when it repeats; only words with a confirmed source count. */
export function wordByText(map: GlyphMap, page: number, text: string, before: string[]): TypesetWord | null {
  const words = (map.get(page) ?? []).filter((w) => w.transformed);
  let best: TypesetWord | null = null;
  let bestScore = -1;
  words.forEach((w, i) => {
    if (w.text !== text || !hasSource(w)) return;
    let score = 0;
    for (let k = 1; k <= before.length && i - k >= 0; k++) if (words[i - k].text === before[before.length - k]) score++;
    if (score > bestScore) {
      bestScore = score;
      best = w;
    }
  });
  return best;
}

/** Whether a word holds any character from main.tex. */
export function hasSource(word: TypesetWord): boolean {
  return word.chars.some(Boolean);
}

/** The sourced word that `word` (one glyph without a source, e.g. the hyphen of a broken word) is set right after on its line. */
export function wordBefore(map: GlyphMap, word: TypesetWord): TypesetWord | null {
  return (map.get(word.page) ?? []).find((w) => w !== word && hasSource(w) && Math.abs(w.y - word.y) < 0.5 && Math.abs(w.x + w.width - word.x) < 0.5) ?? null;
}

const before = (a: TexPos, b: TexPos) => a.line < b.line || (a.line === b.line && a.column <= b.column);
const same = (a: TexPos, b: TexPos) => a.line === b.line && a.column === b.column;

interface CharEntry {
  word: TypesetWord;
  index: number;
  pos: TexPos;
}

const indexes = new WeakMap<GlyphMap, CharEntry[]>();

/** Every typeset character with a source, in source order. */
function charIndex(map: GlyphMap): CharEntry[] {
  let entries = indexes.get(map);
  if (!entries) {
    entries = [];
    for (const words of map.values()) for (const word of words) if (!word.transformed) word.chars.forEach((pos, index) => pos && entries!.push({ word, index, pos }));
    entries.sort((a, b) => a.pos.line - b.pos.line || a.pos.column - b.pos.column);
    indexes.set(map, entries);
  }
  return entries;
}

function box(word: TypesetWord, x: number): CaretBox {
  return { page: word.page, x, top: word.y - word.size * 0.8, height: word.size };
}

/** The caret box for main.tex position `pos`: before the character typeset from it, else after the last character before it for which `accept(line)` holds (a space, a line end, a macro name), else null. */
export function caretAt(map: GlyphMap, pos: TexPos, accept: (line: number) => boolean = () => true): CaretBox | null {
  const entries = charIndex(map);
  // The first entry at or after `pos`.
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (before(pos, entries[mid].pos)) hi = mid;
    else lo = mid + 1;
  }
  const at = lo < entries.length && same(entries[lo].pos, pos) ? lo : -1;
  if (at >= 0) return box(entries[at].word, charX(entries[at].word, entries[at].index));
  const prev = entries[lo - 1];
  return prev && accept(prev.pos.line) ? box(prev.word, charX(prev.word, prev.index + 1)) : null;
}

/** The boxes of the typeset text between main.tex positions `from` and `to` (exclusive), one per printed line, spaces between included. */
export function selectionBoxes(map: GlyphMap, from: TexPos, to: TexPos): PageBox[] {
  const rows = new Map<string, PageBox>();
  for (const e of charIndex(map)) {
    if (!before(from, e.pos) || before(to, e.pos)) continue;
    const x0 = charX(e.word, e.index);
    const x1 = charX(e.word, e.index + 1);
    const key = `${e.word.page}:${e.word.y.toFixed(1)}`;
    const row = rows.get(key);
    if (row) {
      const right = Math.max(row.x + row.width, x1);
      row.x = Math.min(row.x, x0);
      row.width = right - row.x;
    } else rows.set(key, { page: e.word.page, x: x0, top: e.word.y - e.word.size * 0.8, width: x1 - x0, height: e.word.size });
  }
  return [...rows.values()];
}
