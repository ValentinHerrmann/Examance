/** PDF content operators of `pdf:code`/`pdf:literal` specials on a canvas in PDF space (drawn pages, issue #352): the path subset TikZ writes; anything else is not drawable. */
import { cssColor, extGState, NotDrawable, paintShading, readObject, tokenize, type PdfDict, type ShadingContext } from './pdfObjects';

/** The 2D context the renderer draws on (OffscreenCanvas in the worker, @napi-rs/canvas under Node). */
export interface DrawContext extends ShadingContext {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  scale(x: number, y: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  closePath(): void;
  fill(rule?: CanvasFillRule): void;
  fill(path: never, rule?: CanvasFillRule): void;
  stroke(): void;
  setLineDash(segments: number[]): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  miterLimit: number;
  lineDashOffset: number;
  globalAlpha: number;
}

/** What the canvas does not save itself: opacities and the colours set by operators, so `Q` restores them as the PDF does. */
interface GState {
  fillAlpha: number;
  strokeAlpha: number;
  fill: string;
  stroke: string;
}

/** Resources of the page or form being drawn, from `pdf:put @resources`. */
export interface Resources {
  shadings: Map<string, PdfDict>;
  extGStates: Map<string, PdfDict>;
}

const CAPS: CanvasLineCap[] = ['butt', 'round', 'square'];
const JOINS: CanvasLineJoin[] = ['miter', 'round', 'bevel'];
/** Operators that only mark content or set rendering hints. */
const IGNORED = new Set(['i', 'ri', 'BMC', 'BDC', 'EMC', 'MP', 'DP']);

/** Path-painting operators: fill rule (null for none), stroke, close first. */
const PAINT = new Map<string, [CanvasFillRule | null, boolean, boolean]>([
  ['S', [null, true, false]],
  ['s', [null, true, true]],
  ['f', ['nonzero', false, false]],
  ['F', ['nonzero', false, false]],
  ['f*', ['evenodd', false, false]],
  ['B', ['nonzero', true, false]],
  ['B*', ['evenodd', true, false]],
  ['b', ['nonzero', true, true]],
  ['b*', ['evenodd', true, true]],
  ['n', [null, false, false]],
]);

/** Colour operators: the colour they set and their operand count. */
const COLOUR_OPS = new Map<string, ['fill' | 'stroke', number]>([
  ['g', ['fill', 1]],
  ['G', ['stroke', 1]],
  ['rg', ['fill', 3]],
  ['RG', ['stroke', 3]],
  ['k', ['fill', 4]],
  ['K', ['stroke', 4]],
]);

export class ContentRunner {
  private readonly ctx: DrawContext;
  gs: GState = { fillAlpha: 1, strokeAlpha: 1, fill: 'rgb(0,0,0)', stroke: 'rgb(0,0,0)' };
  private readonly stack: GState[] = [];
  private cx = 0;
  private cy = 0;
  private pendingClip: CanvasFillRule | null = null;
  resources: Resources = { shadings: new Map(), extGStates: new Map() };

  constructor(ctx: DrawContext) {
    this.ctx = ctx;
  }

  /** Saves the canvas and our state (`q`, and dvipdfmx's gsave for bcontent/btrans). */
  save(): void {
    this.ctx.save();
    this.stack.push({ ...this.gs });
  }

  restore(): void {
    if (!this.stack.length) throw new NotDrawable('unbalanced Q');
    this.ctx.restore();
    this.gs = this.stack.pop()!;
  }

  get depth(): number {
    return this.stack.length;
  }

  /** Sets the fill and stroke colour (dvipdfmx's colour stack); later operators may change them inside q/Q. */
  setColours(fill: string, stroke: string): void {
    this.gs.fill = fill;
    this.gs.stroke = stroke;
  }

  run(code: string): void {
    const tokens = tokenize(code);
    const ops: (number | string | unknown)[] = [];
    const pos = { i: 0 };
    while (pos.i < tokens.length) {
      const t = tokens[pos.i];
      if (t === '[' || t === '<<' || t.startsWith('/') || t.startsWith('(') || /^[-+.\d]/.test(t)) ops.push(readObject(tokens, pos));
      else {
        pos.i++;
        this.op(t, ops);
        ops.length = 0;
      }
    }
  }

  private n(ops: unknown[], k: number): number[] {
    if (ops.length < k || !ops.slice(-k).every((x) => typeof x === 'number')) throw new NotDrawable('operands');
    return ops.slice(-k) as number[];
  }

  private name(ops: unknown[]): string {
    const v = ops.at(-1) as { name?: string } | undefined;
    if (!v?.name) throw new NotDrawable('name operand');
    return v.name;
  }

  private paint(fill: CanvasFillRule | null, stroke: boolean, close = false): void {
    const ctx = this.ctx;
    if (close) ctx.closePath();
    if (fill) {
      ctx.globalAlpha = this.gs.fillAlpha;
      ctx.fillStyle = this.gs.fill;
      ctx.fill(fill);
    }
    if (stroke) {
      ctx.globalAlpha = this.gs.strokeAlpha;
      ctx.strokeStyle = this.gs.stroke;
      ctx.stroke();
    }
    if (this.pendingClip) ctx.clip(this.pendingClip);
    this.pendingClip = null;
    ctx.beginPath();
  }

  private op(op: string, ops: unknown[]): void {
    const ctx = this.ctx;
    const painting = PAINT.get(op);
    if (painting) return this.paint(...painting);
    const colour = COLOUR_OPS.get(op);
    if (colour) {
      this.gs[colour[0]] = cssColor(this.n(ops, colour[1]));
      return;
    }
    switch (op) {
      case 'q': return this.save();
      case 'Q': return this.restore();
      case 'cm': return ctx.transform(...(this.n(ops, 6) as [number, number, number, number, number, number]));
      case 'm': [this.cx, this.cy] = this.n(ops, 2); return ctx.moveTo(this.cx, this.cy);
      case 'l': [this.cx, this.cy] = this.n(ops, 2); return ctx.lineTo(this.cx, this.cy);
      case 'c': {
        const [a, b, c, d, e, f] = this.n(ops, 6);
        ctx.bezierCurveTo(a, b, c, d, e, f);
        [this.cx, this.cy] = [e, f];
        return;
      }
      case 'v': {
        const [c, d, e, f] = this.n(ops, 4);
        ctx.bezierCurveTo(this.cx, this.cy, c, d, e, f);
        [this.cx, this.cy] = [e, f];
        return;
      }
      case 'y': {
        const [a, b, e, f] = this.n(ops, 4);
        ctx.bezierCurveTo(a, b, e, f, e, f);
        [this.cx, this.cy] = [e, f];
        return;
      }
      case 'h': return ctx.closePath();
      case 're': {
        const [x, y, w, h] = this.n(ops, 4);
        ctx.rect(x, y, w, h);
        [this.cx, this.cy] = [x, y];
        return;
      }
      case 'W': this.pendingClip = 'nonzero'; return;
      case 'W*': this.pendingClip = 'evenodd'; return;
      case 'w': [ctx.lineWidth] = this.n(ops, 1); return;
      case 'J': ctx.lineCap = CAPS[this.n(ops, 1)[0]] ?? 'butt'; return;
      case 'j': ctx.lineJoin = JOINS[this.n(ops, 1)[0]] ?? 'miter'; return;
      case 'M': [ctx.miterLimit] = this.n(ops, 1); return;
      case 'd': {
        const [arr, phase] = ops.slice(-2) as [number[], number];
        if (!Array.isArray(arr) || typeof phase !== 'number') throw new NotDrawable('dash');
        ctx.setLineDash(arr);
        ctx.lineDashOffset = phase;
        return;
      }
      case 'gs': {
        const gs = this.resources.extGStates.get(this.name(ops));
        if (!gs) throw new NotDrawable('unknown ExtGState');
        const { fill, stroke } = extGState(gs);
        this.gs.fillAlpha = fill;
        this.gs.strokeAlpha = stroke;
        return;
      }
      case 'sh': {
        const sh = this.resources.shadings.get(this.name(ops));
        if (!sh) throw new NotDrawable('unknown shading');
        ctx.globalAlpha = this.gs.fillAlpha;
        return paintShading(ctx, sh);
      }
      default:
        if (!IGNORED.has(op)) throw new NotDrawable(`operator ${op}`);
    }
  }
}
