/** PDF objects in dvipdfmx specials (`pdf:put @resources << … >>`) for drawn pages (issue #352): a small parser and pgf's shadings as canvas gradients. */

export type PdfValue = number | boolean | null | { name: string } | { ref: string } | string | PdfValue[] | PdfDict;
export interface PdfDict {
  [key: string]: PdfValue;
}

/** Thrown for anything drawn pages do not reproduce exactly: that page shows the real PDF instead. */
export class NotDrawable extends Error {
  constructor(what: string) {
    super(what);
    this.name = 'NotDrawable';
  }
}

const KEYWORDS = new Map<string, PdfValue>([['true', true], ['false', false], ['null', null]]);
const DELIM = new Set(['[', ']', '(', ')', '<', '>', '{', '}', '/', '%']);
const isSpace = (c: string) => c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\0';

/** Index of the `)` closing the string literal that opens at `i`, honouring nesting and backslash escapes (text length when unterminated). */
function stringEnd(text: string, i: number): number {
  let depth = 0;
  let j = i;
  for (; j < text.length; j++) {
    if (text[j] === '\\') j++;
    else if (text[j] === '(') depth++;
    else if (text[j] === ')' && --depth === 0) break;
  }
  return j;
}

/** The token starting at `i` (null for whitespace and comments) and the index after it. */
function nextToken(text: string, i: number): [string | null, number] {
  const c = text[i];
  if (isSpace(c)) return [null, i + 1];
  if (c === '%') {
    const end = text.indexOf('\n', i);
    return [null, end < 0 ? text.length : end];
  }
  if (c === '[' || c === ']' || c === '{' || c === '}') return [c, i + 1];
  if ((c === '<' || c === '>') && text[i + 1] === c) return [c + c, i + 2];
  if (c === '(') {
    const j = stringEnd(text, i);
    return [text.slice(i, j + 1), j + 1];
  }
  if (c === '<') {
    const j = text.indexOf('>', i);
    return [text.slice(i, j + 1), j + 1];
  }
  let j = i + 1;
  while (j < text.length && !isSpace(text[j]) && !DELIM.has(text[j])) j++;
  return [text.slice(i, j), j];
}

/** Tokens of PDF syntax (also content streams): numbers and keywords as strings, names as `/x`, strings as `(x)`, plus `[ ] << >>`. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const [token, next] = nextToken(text, i);
    if (token !== null) out.push(token);
    i = next;
  }
  return out;
}

function readArray(tokens: string[], pos: { i: number }): PdfValue {
  const arr: PdfValue[] = [];
  while (tokens[pos.i] !== ']') arr.push(readObject(tokens, pos));
  pos.i++;
  return arr;
}

function readDict(tokens: string[], pos: { i: number }): PdfValue {
  const dict: PdfDict = {};
  while (tokens[pos.i] !== '>>') {
    const key = tokens[pos.i++];
    if (!key?.startsWith('/')) throw new NotDrawable('bad dictionary key');
    dict[key.slice(1)] = readObject(tokens, pos);
  }
  pos.i++;
  return dict;
}

/** A PDF object that is a single token (dvipdfmx's `@name` is a reference). */
function readAtom(t: string): PdfValue {
  let value: PdfValue;
  if (t.startsWith('/')) value = { name: t.slice(1) };
  else if (t.startsWith('@')) value = { ref: t };
  else if (KEYWORDS.has(t)) value = KEYWORDS.get(t) ?? null;
  else if (t.startsWith('(') || t.startsWith('<')) value = t;
  else {
    value = Number(t);
    if (Number.isNaN(value)) throw new NotDrawable(`PDF token ${t}`);
  }
  return value;
}

/** One PDF object from `tokens` at `pos.i`. */
export function readObject(tokens: string[], pos: { i: number }): PdfValue {
  if (pos.i >= tokens.length) throw new NotDrawable('truncated PDF object');
  const t = tokens[pos.i++];
  if (t === '[') return readArray(tokens, pos);
  if (t === '<<') return readDict(tokens, pos);
  return readAtom(t);
}

export function parseDict(text: string): PdfDict {
  const v = readObject(tokenize(text), { i: 0 });
  if (!v || typeof v !== 'object' || Array.isArray(v) || 'name' in v || 'ref' in v) throw new NotDrawable('not a dictionary');
  return v as PdfDict;
}

const nums = (v: PdfValue | undefined, n?: number): number[] => {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number') || (n !== undefined && v.length !== n)) throw new NotDrawable('bad number array');
  return v as number[];
};
const numsOr = (v: PdfValue | undefined, fallback: number[], n?: number): number[] => (v === undefined ? fallback : nums(v, n));
const dictOf = (v: PdfValue | undefined): PdfDict => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || 'name' in v || 'ref' in v) throw new NotDrawable('not a dictionary');
  return v as PdfDict;
};
const numberOf = (v: PdfValue | undefined): number | undefined => (typeof v === 'number' ? v : undefined);
const nameOf = (v: PdfValue | undefined): string | null => (v && typeof v === 'object' && 'name' in v && typeof v.name === 'string' ? v.name : null);

/** A colour of DeviceGray, DeviceRGB or DeviceCMYK components (0..1) as CSS. */
export function cssColor(c: number[]): string {
  const to = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255);
  if (c.length === 1) return `rgb(${to(c[0])},${to(c[0])},${to(c[0])})`;
  if (c.length === 3) return `rgb(${to(c[0])},${to(c[1])},${to(c[2])})`;
  if (c.length === 4) return `rgb(${to((1 - c[0]) * (1 - c[3]))},${to((1 - c[1]) * (1 - c[3]))},${to((1 - c[2]) * (1 - c[3]))})`;
  throw new NotDrawable('colour');
}

/** Colour stops of a shading function over its domain: type 2 with N=1, or type 3 stitching such functions with Encode [0 1 …]. */
function stops(fn: PdfDict, domain: [number, number], channels: number): [number, string][] {
  const span = domain[1] - domain[0] || 1;
  const at = (t: number) => (t - domain[0]) / span;
  const linear = (f: PdfDict, from: number, to: number): [number, string][] => {
    if (numberOf(f.FunctionType) !== 2 || (numberOf(f.N) ?? 1) !== 1) throw new NotDrawable('shading function');
    const c0 = numsOr(f.C0, [0]), c1 = numsOr(f.C1, [1]);
    if (c0.length !== channels || c1.length !== channels) throw new NotDrawable('shading colour');
    return [[at(from), cssColor(c0)], [at(to), cssColor(c1)]];
  };
  if (numberOf(fn.FunctionType) === 2) return linear(fn, domain[0], domain[1]);
  if (numberOf(fn.FunctionType) !== 3) throw new NotDrawable('shading function');
  const fns = Array.isArray(fn.Functions) ? fn.Functions.map(dictOf) : [];
  const bounds = nums(fn.Bounds ?? [], fns.length - 1);
  const encode = nums(fn.Encode, fns.length * 2);
  if (encode.some((e, k) => e !== k % 2)) throw new NotDrawable('shading encode');
  const edges = [domain[0], ...bounds, domain[1]];
  return fns.flatMap((f, k) => linear(f, edges[k], edges[k + 1]));
}

/** The parts of a 2D context shadings need. */
export interface ShadingContext {
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(a: number): void;
  beginPath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  clip(rule?: CanvasFillRule): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillStyle: string | CanvasGradient | CanvasPattern;
}

const BIG = 1e5;
const CHANNELS = new Map([['DeviceRGB', 3], ['DeviceGray', 1], ['DeviceCMYK', 4]]);

/** Axial gradient along the axis, with the clip to the axis' extent; leaves the context in the user's frame. */
function axialGradient(ctx: ShadingContext, sh: PdfDict, extend: boolean[]): CanvasGradient {
  const [x0, y0, x1, y1] = nums(sh.Coords, 4);
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  const len = Math.hypot(x1 - x0, y1 - y0);
  const angle = Math.atan2(y1 - y0, x1 - x0);
  ctx.translate(x0, y0);
  ctx.rotate(angle);
  ctx.beginPath();
  const from = extend[0] ? -BIG : 0;
  const to = extend[1] ? len + BIG : len;
  ctx.rect(from, -BIG, to - from, 2 * BIG);
  ctx.clip();
  ctx.rotate(-angle);
  ctx.translate(-x0, -y0);
  return gradient;
}

/** Radial gradient (concentric, or extended both ways) with the clips for a bounded start or end circle. */
function radialGradient(ctx: ShadingContext, sh: PdfDict, extend: boolean[]): CanvasGradient {
  const [x0, y0, r0, x1, y1, r1] = nums(sh.Coords, 6);
  if ((x0 !== x1 || y0 !== y1) && !(extend[0] && extend[1])) throw new NotDrawable('radial shading');
  const gradient = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
  if (!extend[1]) {
    ctx.beginPath();
    ctx.arc(x1, y1, r1, 0, 2 * Math.PI);
    ctx.clip();
  }
  if (!extend[0] && r0 > 0) {
    ctx.beginPath();
    ctx.rect(-BIG, -BIG, 2 * BIG, 2 * BIG);
    ctx.arc(x0, y0, r0, 0, 2 * Math.PI);
    ctx.clip('evenodd');
  }
  return gradient;
}

/** Paints an axial or radial shading over the current clip (the `sh` operator), as the PDF would; anything else is not drawable. */
export function paintShading(ctx: ShadingContext, sh: PdfDict): void {
  const type = numberOf(sh.ShadingType);
  const channels = CHANNELS.get(nameOf(sh.ColorSpace) ?? '') ?? 0;
  if ((type !== 2 && type !== 3) || !channels) throw new NotDrawable('shading type');
  const domain = numsOr(sh.Domain, [0, 1], 2) as [number, number];
  const extend = Array.isArray(sh.Extend) ? sh.Extend.map(Boolean) : [false, false];
  const colourStops = stops(dictOf(sh.Function), domain, channels);
  ctx.save();
  const gradient = type === 2 ? axialGradient(ctx, sh, extend) : radialGradient(ctx, sh, extend);
  for (const [offset, colour] of colourStops) gradient.addColorStop(Math.min(1, Math.max(0, offset)), colour);
  ctx.fillStyle = gradient;
  ctx.fillRect(-BIG, -BIG, 2 * BIG, 2 * BIG);
  ctx.restore();
}

/** Fill and stroke opacity of an ExtGState (`ca`, `CA`); other entries are not drawable. */
export function extGState(gs: PdfDict): { fill: number; stroke: number } {
  for (const key of Object.keys(gs)) if (!['ca', 'CA', 'Type'].includes(key)) throw new NotDrawable(`ExtGState ${key}`);
  return { fill: typeof gs.ca === 'number' ? gs.ca : 1, stroke: typeof gs.CA === 'number' ? gs.CA : 1 };
}
