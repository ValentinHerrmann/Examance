/** What a stretch of LaTeX source prints, with each printed character's source position, and the same normalisation for text read from a PDF; click-to-source matches words in it (issue #347). An approximation: macros are dropped, their arguments kept. */

/** A printed view: `text`, and for each of its characters the source `[line, column]` (1-based line, 0-based UTF-16 column). */
export interface PrintedView {
  text: string;
  at: [number, number][];
}

/** Accent macros (`\"a`, babel's `"a`) and their composed letters. */
const UMLAUT: Record<string, string> = { a: 'ä', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü', e: 'ë', i: 'ï' };
const WORD_MACROS: Record<string, string> = { ss: 'ß', SS: 'SS', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', o: 'ø', O: 'Ø', aa: 'å', AA: 'Å', l: 'ł', L: 'Ł' };

/** Ligatures and typographic marks the PDF prints for plain source characters. */
const PDF_CHARS: Record<string, string> = {
  'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl',
  '–': '-', '—': '-', '‘': "'", '’': "'", '‚': "'", '“': '"', '”': '"', '„': '"',
  '­': '', ' ': ' ',
};

const isLetter = (c: string | undefined): boolean => c !== undefined && /[\p{L}\p{N}]/u.test(c);

/** Text read from a PDF in the form `printedView` produces: ligatures split, dashes and quotes plain, soft hyphens gone. */
export function normalizePrinted(text: string): string {
  let out = '';
  for (const c of text) out += PDF_CHARS[c] ?? c;
  return out;
}

/** The printed view of `lines` (1-based numbers from `firstLine`): comments, braces and macro names dropped, accent macros composed, `--` and quotes plain, `~` a space, a line end a space. */
export function printedView(lines: string[], firstLine = 1): PrintedView {
  const view: PrintedView = { text: '', at: [] };
  const put = (s: string, line: number, col: number) => {
    for (const c of s) {
      view.text += c;
      view.at.push([line, col]);
    }
  };
  lines.forEach((src, i) => {
    const line = firstLine + i;
    let c = 0;
    while (c < src.length && !(src[c] === '%' && src[c - 1] !== '\\')) c = step(src, c, line, put);
    put(' ', line, src.length);
  });
  return view;
}

type Put = (s: string, line: number, col: number) => void;

/** One printed unit at column `c`: a macro, babel's `"a`, a brace or a plain character; returns the column after it. */
function step(src: string, c: number, line: number, put: Put): number {
  const ch = src[c];
  if (ch === '\\') return macro(src, c, line, put);
  if (ch === '"' && UMLAUT[src[c + 1]]) {
    put(UMLAUT[src[c + 1]], line, c);
    return c + 2;
  }
  if (ch !== '{' && ch !== '}' && ch !== '$') put(ch === '~' ? ' ' : ch.replace('`', "'"), line, c);
  return c + 1;
}

/** `\"a` or `\"{a}` at `c`: the composed letter and the column after it, or null. */
function accent(src: string, c: number): { letter: string; end: number } | null {
  if (src[c + 1] !== '"') return null;
  const braced = src[c + 2] === '{';
  const letter = UMLAUT[braced ? src[c + 3] : src[c + 2]];
  return letter ? { letter, end: c + (braced ? 5 : 3) } : null;
}

/** A control symbol at `c` (`\\`, `\-`, `\%`, `\&` …): an escaped character prints itself, a line break or `\ ` a space; returns the column after it. */
function controlSymbol(src: string, c: number, line: number, put: Put): number {
  const next = src[c + 1] ?? '';
  if (next && '%&#_$'.includes(next)) put(next, line, c);
  else if (next === '\\' || next === ' ') put(' ', line, c);
  return c + 2;
}

/** One macro at `c`: an accent or letter macro prints its character, `\-` and other names print nothing (their arguments are read as text); returns the column after it. */
function macro(src: string, c: number, line: number, put: Put): number {
  const composed = accent(src, c);
  if (composed) {
    put(composed.letter, line, c);
    return composed.end;
  }
  if (!/[A-Za-z]/.test(src[c + 1] ?? '')) return controlSymbol(src, c, line, put);
  let end = c + 1;
  while (end < src.length && /[A-Za-z]/.test(src[end])) end++;
  const letter = WORD_MACROS[src.slice(c + 1, end)];
  if (letter) put(letter, line, c);
  // A space after a macro name is eaten by TeX; `{}` after a letter macro too.
  if (src[end] === ' ') end++;
  else if (letter && src.slice(end, end + 2) === '{}') end += 2;
  return end;
}

/** The letter at `at`, or the nearest letter on either side; -1 when `text` has none. */
function nearestLetter(text: string, at: number): number {
  if (isLetter(text[at])) return at;
  let left = at;
  let right = at;
  while (left >= 0 && !isLetter(text[left])) left--;
  while (right < text.length && !isLetter(text[right])) right++;
  if (left < 0) return right < text.length ? right : -1;
  if (right >= text.length) return left;
  return right - at < at - left ? right : left;
}

/** The word around `index` in `text`, or the nearest word when it is a space or punctuation: its start and end. */
export function wordSpan(text: string, index: number): { from: number; to: number } | null {
  const at = nearestLetter(text, Math.max(0, Math.min(index, text.length - 1)));
  if (at < 0) return null;
  let from = at;
  let to = at + 1;
  while (from > 0 && isLetter(text[from - 1])) from--;
  while (to < text.length && isLetter(text[to])) to++;
  return { from, to };
}

/** The words of `text`, in order. */
export function wordsOf(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+/gu) ?? [];
}
