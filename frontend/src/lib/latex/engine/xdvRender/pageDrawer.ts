/** Draws the items of one XDV page on a canvas, one handler per special command (drawn pages, issue #352). */
import { ContentRunner, type DrawContext } from './content';
import { FontStore } from './fonts';
import { NotDrawable, parseDict, type PdfDict, type PdfValue } from './pdfObjects';
import { A4, BLACK, colourSpecial, command, IGNORED_SPECIALS, ORIGIN, SP_PER_BP, transformMatrix, type Colour, type DocumentScan, type Point } from './specials';
import type { ParsedXdv, XdvItem } from './xdv';

type Handler = (rest: string, cp: Point) => void;

const dictValue = (v: PdfValue | undefined): PdfDict | null => (v && typeof v === 'object' && !Array.isArray(v) && !('name' in v) && !('ref' in v) ? (v as PdfDict) : null);

export class PageDrawer {
  private readonly run: ContentRunner;
  private readonly colours: Colour[];
  private readonly height: number;
  /** The bcontent origins (dvipdfmx's coordinate stack); positions are drawn relative to the innermost. */
  private readonly coords: Point[] = [];
  private readonly frames: number[] = [];
  private readonly handlers = new Map<string, Handler>();

  constructor(
    private readonly ctx: DrawContext,
    private readonly doc: ParsedXdv,
    private readonly scan: DocumentScan,
    private readonly fonts: FontStore,
    private readonly scale: number,
    private readonly number: number,
  ) {
    this.height = (scan.sizes[number] ?? A4).height;
    this.run = new ContentRunner(ctx);
    this.colours = scan.coloursAtStart[number]?.map((c) => ({ ...c })) ?? [];
    this.registerHandlers();
  }

  draw(items: XdvItem[]): void {
    const { ctx, scale, height } = this;
    const { width } = this.scan.sizes[this.number] ?? A4;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width * scale, height * scale);
    ctx.setTransform(scale, 0, 0, -scale, 0, height * scale);
    this.syncColours();
    this.drawItems(items, [0, 0]);
  }

  private syncColours(): void {
    const top = this.colours.at(-1) ?? BLACK;
    this.run.setColours(top.fill, top.stroke);
  }

  private toUser(x: number, y: number, base: Point): Point {
    const [ox, oy] = this.coords.at(-1) ?? [0, 0];
    return [x / SP_PER_BP + ORIGIN + base[0] - ox, this.height - (y / SP_PER_BP + ORIGIN) + base[1] - oy];
  }

  private drawItems(items: XdvItem[], base: Point): void {
    let skipping = 0;
    for (const item of items) {
      if (item.t === 'special') {
        const { cmd, rest } = command(item.text);
        if (cmd === 'pdf:bxobj') skipping++;
        else if (cmd === 'pdf:exobj') skipping--;
        else if (!skipping) this.special(cmd, rest, this.toUser(item.x, item.y, base));
      } else if (!skipping) this.drawShape(item, base);
    }
  }

  private drawShape(item: Exclude<XdvItem, { t: 'special' }>, base: Point): void {
    const [x, y] = this.toUser(item.x, item.y, base);
    if (item.t === 'rule') {
      this.ctx.globalAlpha = this.run.gs.fillAlpha;
      this.ctx.fillStyle = this.run.gs.fill;
      this.ctx.fillRect(x, y, item.w / SP_PER_BP, item.h / SP_PER_BP);
    } else if (item.t === 'char') this.glyph(item.font, item.code, x, y);
    else for (let k = 0; k < item.glyphs.length; k++) this.glyph(item.font, item.glyphs[k], x + item.dx[k] / SP_PER_BP, y - item.dy[k] / SP_PER_BP);
  }

  private glyph(fontNo: number, g: number, x: number, y: number): void {
    const { ctx, run } = this;
    const font = this.doc.fonts.get(fontNo);
    if (!font) throw new NotDrawable('undefined font');
    if (font.kind === 'native' && font.embolden) throw new NotDrawable('emboldened font');
    const shape = this.fonts.shape(font, g);
    if (!shape) throw new NotDrawable('glyph');
    if (!shape.path) return;
    const t = this.fonts.transformCached(font);
    const s = FontStore.sizeBp(font) / shape.unitsPerEm;
    ctx.save();
    ctx.transform(t.extend * s, 0, t.slant * s, s, x, y);
    ctx.globalAlpha = run.gs.fillAlpha;
    if (font.kind === 'native' && font.rgba !== null) {
      const c = font.rgba >>> 0;
      ctx.globalAlpha = ((c & 255) / 255) * run.gs.fillAlpha;
      ctx.fillStyle = `rgb(${c >>> 24},${(c >>> 16) & 255},${(c >>> 8) & 255})`;
    } else ctx.fillStyle = run.gs.fill;
    ctx.fill(shape.path as never);
    ctx.restore();
  }

  private special(cmd: string, rest: string, cp: Point): void {
    if (colourSpecial(this.colours, cmd, rest)) {
      this.syncColours();
      return;
    }
    const handler = this.handlers.get(cmd);
    if (!handler) throw new NotDrawable(`special ${cmd}`);
    handler(rest, cp);
  }

  private registerHandlers(): void {
    const { run, handlers } = this;
    const closeScope: Handler = () => this.closeScope();
    const literal: Handler = (rest, cp) => this.literal(rest, cp);
    handlers.set('pdf:code', (rest) => run.run(rest));
    handlers.set('pdf:literal', literal);
    handlers.set('pdf:content', literal);
    handlers.set('pdf:bcontent', (_rest, cp) => this.beginContent(cp));
    handlers.set('pdf:econtent', () => {
      this.coords.pop();
      this.closeScope();
    });
    handlers.set('pdf:btrans', (rest, cp) => {
      run.save();
      this.transform('pdf:btrans', rest, cp);
    });
    handlers.set('x:rotate', (rest, cp) => this.transform('x:rotate', rest, cp));
    handlers.set('x:scale', (rest, cp) => this.transform('x:scale', rest, cp));
    handlers.set('pdf:etrans', closeScope);
    handlers.set('x:gsave', () => {
      this.frames.push(run.depth);
      run.save();
    });
    handlers.set('x:grestore', () => {
      if (this.frames.pop() === undefined) throw new NotDrawable('x:grestore');
      run.restore();
    });
    handlers.set('pdf:put', (rest) => this.putResources(rest));
    handlers.set('pdf:uxobj', (rest, cp) => this.useForm(rest, cp));
    handlers.set('pdf:ann', (rest) => {
      if (!/\/Subtype\s*\/Link\b/.test(rest)) throw new NotDrawable('annotation');
    });
    for (const name of IGNORED_SPECIALS) handlers.set(name, () => undefined);
  }

  private closeScope(): void {
    this.run.restore();
    this.syncColours();
  }

  /** `pdf:literal`/`pdf:content` code, drawn at the current point unless it says `direct`. */
  private literal(rest: string, cp: Point): void {
    const direct = /^direct\b/.test(rest);
    const code = rest.replace(/^direct\b/, '');
    if (!direct) this.ctx.translate(cp[0], cp[1]);
    this.run.run(code);
    if (!direct) this.ctx.translate(-cp[0], -cp[1]);
  }

  private beginContent(cp: Point): void {
    const [ox, oy] = this.coords.at(-1) ?? [0, 0];
    this.run.save();
    this.ctx.translate(cp[0], cp[1]);
    this.coords.push([cp[0] + ox, cp[1] + oy]);
  }

  /** Transforms dvipdfmx applies around the current point (btrans, x:rotate, x:scale). */
  private transform(cmd: string, rest: string, cp: Point): void {
    const [a, b, c, d, e, f] = transformMatrix(cmd, rest);
    this.ctx.transform(a, b, c, d, e + (1 - a) * cp[0] - c * cp[1], f + (1 - d) * cp[1] - b * cp[0]);
  }

  private putResources(rest: string): void {
    if (!rest.startsWith('@resources')) return;
    const dict = parseDict(rest.slice('@resources'.length));
    const { shadings, extGStates } = this.run.resources;
    const targets = new Map([['Shading', shadings], ['ExtGState', extGStates]]);
    for (const [key, value] of Object.entries(dict)) {
      const entries = dictValue(value);
      const target = targets.get(key);
      if (entries && target) for (const [n, v] of Object.entries(entries)) target.set(n, dictValue(v) ?? {});
    }
  }

  private useForm(rest: string, cp: Point): void {
    const { ctx, run } = this;
    const form = this.scan.forms.get(rest.split(/\s+/)[0]);
    if (!form) throw new NotDrawable('unknown XObject');
    run.save();
    ctx.beginPath();
    ctx.rect(cp[0], cp[1] - form.depth, form.width, form.height + form.depth);
    ctx.clip();
    const outer = run.resources;
    run.resources = { shadings: new Map(), extGStates: new Map() };
    const [fx, fy] = this.toUser(form.x, form.y, [0, 0]);
    this.drawItems(form.items, [cp[0] - fx, cp[1] - fy]);
    run.resources = outer;
    run.restore();
  }
}
