/** The specials of an XDV (dvipdfmx's `pdf:` and `x:` commands, `color`, `papersize`) that drawn pages read: their syntax, colours and shared page types (issue #352). */
import { cssColor, NotDrawable } from './pdfObjects';
import type { XdvItem } from './xdv';

export const SP_PER_BP = 65781.76;
/** dvipdfmx puts TeX's origin one inch from the top left. */
export const ORIGIN = 72;
/** dvipdfmx.cfg's paper (`p a4`) unless the document sets one. */
export const A4 = { width: 595.276, height: 841.89 };

export interface PageSize {
  width: number;
  height: number;
}

export interface Colour {
  fill: string;
  stroke: string;
}

export type Point = [number, number];

export interface Form {
  items: XdvItem[];
  /** Where the form began (its origin), in sp. */
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
}

/** What drawing one page needs from the pages before it: forms they defined, the colour stack at its start, the paper size. */
export interface DocumentScan {
  /** Paper size per page number (`papersize`, `pdf:pagesize`; A4 by default). */
  sizes: PageSize[];
  forms: Map<string, Form>;
  coloursAtStart: Colour[][];
}

export const BLACK: Colour = { fill: 'rgb(0,0,0)', stroke: 'rgb(0,0,0)' };

/** Specials that carry nothing to draw. */
export const IGNORED_SPECIALS = [
  'pdf:obj', 'pdf:majorversion', 'pdf:minorversion', 'pdf:docinfo', 'pdf:dest', 'pdf:outline', 'pdf:bann', 'pdf:eann', 'pdf:pagesize', 'papersize', 'dvipdfmx:config', 'pdf:docview',
];

const isWhite = (c: string): boolean => /\s/.test(c);

/** Index of the first character at or after `i` that fails `keep`. */
function skipWhile(t: string, i: number, keep: (c: string) => boolean): number {
  while (i < t.length && keep(t[i])) i++;
  return i;
}

const isLetter = (c: string) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');

/** The command of a special: `pdf:code q` and `pdf: code q` are both `pdf:code`; `color push …` and `papersize=…` keep their word. */
export function command(text: string): { cmd: string; rest: string } {
  const t = text.trimStart();
  const prefix = ['pdf:', 'x:'].find((p) => t.startsWith(p));
  if (prefix) {
    const nameStart = skipWhile(t, prefix.length, isWhite);
    const nameEnd = skipWhile(t, nameStart, isLetter);
    return { cmd: prefix + t.slice(nameStart, nameEnd), rest: t.slice(skipWhile(t, nameEnd, isWhite)) };
  }
  const word = ['color', 'papersize'].find((p) => t.startsWith(p));
  if (word) {
    const argStart = skipWhile(t, word.length, (c) => c === '=' || isWhite(c));
    const argEnd = skipWhile(t, argStart, (c) => !isWhite(c));
    const rest = t.slice(skipWhile(t, argEnd, isWhite));
    return { cmd: word, rest: `${t.slice(argStart, argEnd)} ${rest}`.trim() };
  }
  return { cmd: t.split(/\s/)[0], rest: '' };
}

/** A colour of `color push rgb 1 0 0` (`gray 0`, `cmyk …`), or null when it is not one we draw. */
function parseColour(words: string[]): string | null {
  const [space, ...vals] = words;
  const n = vals.map(Number);
  if (n.some((x) => Number.isNaN(x))) return null;
  if (space === 'gray' && n.length === 1) return cssColor(n);
  if (space === 'rgb' && n.length === 3) return cssColor(n);
  if (space === 'cmyk' && n.length === 4) return cssColor(n);
  return null;
}

/** The contents of every `[…]` in `text`. */
function bracketed(text: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const open = text.indexOf('[', from);
    const close = open < 0 ? -1 : text.indexOf(']', open + 1);
    if (close < 0) return out;
    out.push(text.slice(open + 1, close));
    from = close + 1;
  }
}

const components = (s: string): number[] => s.trim().split(/\s+/).filter(Boolean).map(Number);
const isColourArray = (a: number[]): boolean => [1, 3, 4].includes(a.length) && !a.some((x) => Number.isNaN(x));

/** dvipdfmx's `bcolor`/`scolor` operands: one or two arrays (fill, then stroke), or a colour word. */
function parsePdfColour(rest: string): Colour | null {
  const arrays = bracketed(rest).map(components);
  if (arrays.length) {
    if (!arrays.every(isColourArray)) return null;
    return { fill: cssColor(arrays[0]), stroke: cssColor(arrays[1] ?? arrays[0]) };
  }
  const c = parseColour(rest.split(/\s+/));
  return c ? { fill: c, stroke: c } : null;
}

/** `color push|pop|<space> …`: `push` stacks a colour, a bare colour replaces the stack. */
function colorSpecial(stack: Colour[], rest: string): void {
  const [op, ...words] = rest.split(/\s+/);
  if (op === 'pop') {
    stack.pop();
    return;
  }
  const c = parseColour(op === 'push' ? words : [op, ...words]);
  if (!c) throw new NotDrawable(`colour ${rest}`);
  if (op !== 'push') stack.length = 0;
  stack.push({ fill: c, stroke: c });
}

/** Applies a colour special to `stack`; true when `cmd` was one. */
export function colourSpecial(stack: Colour[], cmd: string, rest: string): boolean {
  if (cmd === 'color') colorSpecial(stack, rest);
  else if (cmd === 'pdf:bcolor' || cmd === 'pdf:bc') {
    const c = parsePdfColour(rest);
    if (!c) throw new NotDrawable(`colour ${rest}`);
    stack.push(c);
  } else if (cmd === 'pdf:ecolor' || cmd === 'pdf:ec') stack.pop();
  else return false;
  return true;
}

const UNITS: Record<string, number> = { pt: 72 / 72.27, bp: 1, mm: 72 / 25.4, cm: 72 / 2.54, in: 72 };

/** A length such as `12pt` in bp (bare numbers are bp, anything else 0). */
export function dim(s: string): number {
  const m = /^(-?[\d.]+)(pt|bp|mm|cm|in)?$/.exec(s);
  return m ? Number(m[1]) * (UNITS[m[2] ?? 'bp'] ?? 1) : 0;
}

/** The six-number matrix of `pdf:btrans`, `x:rotate` or `x:scale`; anything else is not drawable. */
export function transformMatrix(cmd: string, rest: string): number[] {
  const w = rest.split(/\s+/);
  const m = matrixOf(cmd, w, rest);
  if (m.length !== 6 || m.some((x) => !Number.isFinite(x))) throw new NotDrawable(`transform ${rest}`);
  return m;
}

function matrixOf(cmd: string, w: string[], rest: string): number[] {
  if (cmd === 'x:rotate' || w[0] === 'rotate') {
    const r = (Number(cmd === 'x:rotate' ? w[0] : w[1]) * Math.PI) / 180;
    return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
  }
  if (cmd === 'x:scale' || ['scale', 'xscale', 'yscale'].includes(w[0])) {
    const v = w.slice(cmd === 'x:scale' ? 0 : 1).map(Number);
    if (w[0] === 'xscale') return [v[0], 0, 0, 1, 0, 0];
    if (w[0] === 'yscale') return [1, 0, 0, v[0], 0, 0];
    return [v[0], 0, 0, v[1] ?? v[0], 0, 0];
  }
  if (w[0] === 'matrix') return w.slice(1, 7).map(Number);
  throw new NotDrawable(`transform ${rest}`);
}
