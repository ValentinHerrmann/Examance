/** XDV (XeTeX's DVI, id 7) to display lists per page for drawn pages (issue #352). Positions in sp, from the page's TeX origin, y down. */

export interface NativeFont {
  kind: 'native';
  /** Font file in the tree (kpathsea's full path), or a name the renderer cannot resolve. */
  path: string;
  index: number;
  /** Size in sp. */
  size: number;
  /** RGBA from the font definition (the `color` feature), null when none. */
  rgba: number | null;
  extend: number;
  slant: number;
  embolden: number;
}

export interface TfmFont {
  kind: 'tfm';
  name: string;
  /** Scaled size and design size in sp. */
  size: number;
  designSize: number;
}

export type XdvFont = NativeFont | TfmFont;

export type XdvItem =
  | { t: 'glyphs'; font: number; x: number; y: number; dx: number[]; dy: number[]; glyphs: number[] }
  | { t: 'char'; font: number; x: number; y: number; code: number }
  | { t: 'rule'; x: number; y: number; w: number; h: number }
  | { t: 'special'; x: number; y: number; text: string };

export interface XdvPage {
  /** Page number in the document, from 1. */
  number: number;
  items: XdvItem[];
}

export interface ParsedXdv {
  fonts: Map<number, XdvFont>;
  pages: XdvPage[];
  /** TFM fonts whose widths were missing: their characters advanced by 0, so parse again once they are loaded. */
  missingWidths: Set<string>;
}

/** Width in sp of a character of a TFM font at its size, or undefined when its metrics are not loaded yet. */
export type CharWidth = (font: TfmFont, code: number) => number | undefined;

const FLAG_COLORED = 0x0200;
const FLAG_EXTEND = 0x1000;
const FLAG_SLANT = 0x2000;
const FLAG_EMBOLDEN = 0x4000;

const utf8 = new TextDecoder();
const latin1 = new TextDecoder('latin1');

/** One pass over the XDV bytes; the registers are TeX's DVI state (h, v, w, x, y, z) and the opcodes are those of the DVI format plus XeTeX's 252-254. */
class XdvParser {
  private readonly dv: DataView;
  private i = 0;
  private h = 0;
  private v = 0;
  private w = 0;
  private x = 0;
  private y = 0;
  private z = 0;
  private f = -1;
  private readonly stack: number[][] = [];
  private page: XdvPage | null = null;
  private pageNo = 0;
  private readonly fonts = new Map<number, XdvFont>();
  private readonly pages: XdvPage[] = [];
  private readonly missingWidths = new Set<string>();

  constructor(
    private readonly bytes: Uint8Array,
    private readonly width: CharWidth,
    private readonly from: number,
  ) {
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  run(): ParsedXdv {
    while (this.i < this.bytes.length) {
      if (!this.step(this.bytes[this.i++])) break;
    }
    return { fonts: this.fonts, pages: this.pages, missingWidths: this.missingWidths };
  }

  private u(n: number): number {
    let v = 0;
    for (let k = 0; k < n; k++) v = v * 256 + this.bytes[this.i++];
    return v;
  }

  private s(n: number): number {
    const { dv, i } = this;
    let v: number;
    switch (n) {
      case 1:
        v = dv.getInt8(i);
        break;
      case 2:
        v = dv.getInt16(i);
        break;
      case 3:
        v = (dv.getInt16(i) * 256) | this.bytes[i + 2];
        break;
      default:
        v = dv.getInt32(i);
    }
    this.i += n;
    return v;
  }

  private text(len: number, decoder = utf8): string {
    const text = decoder.decode(this.bytes.subarray(this.i, this.i + len));
    this.i += len;
    return text;
  }

  private emit(item: XdvItem): void {
    if (this.page && this.page.number >= this.from) this.page.items.push(item);
  }

  /** Runs one opcode; false at the postamble. */
  private step(o: number): boolean {
    if (o < 128) this.setChar(o, true);
    else if (o <= 131) this.setChar(this.u(o - 127), true);
    else if (o === 132 || o === 137) this.rule(o === 132);
    else if (o <= 136) this.setChar(this.u(o - 132), false);
    else if (o >= 141 && o <= 170) this.move(o);
    else if (o >= 171 && o <= 238) this.f = o <= 234 ? o - 171 : this.u(o - 234);
    else if (o >= 239 && o <= 242) this.special(this.u(o - 238));
    else if (o >= 243 && o <= 246) this.tfmFont(this.u(o - 242));
    else return this.control(o);
    return true;
  }

  /** Page structure and the XeTeX opcodes; false at the postamble. */
  private control(o: number): boolean {
    switch (o) {
      case 138:
        break;
      case 139:
        this.beginPage();
        break;
      case 140:
        if (this.page && this.page.number >= this.from) this.pages.push(this.page);
        this.page = null;
        break;
      case 247:
        this.i += 13;
        this.i += this.u(1);
        break;
      case 248:
        return false;
      case 252:
        this.nativeFont();
        break;
      case 253:
        this.glyphs(false);
        break;
      case 254:
        this.glyphs(true);
        break;
      default:
        throw new Error(`XDV opcode ${o} at ${this.i - 1}`);
    }
    return true;
  }

  private beginPage(): void {
    this.i += 44;
    this.pageNo++;
    this.page = { number: this.pageNo, items: [] };
    this.h = this.v = this.w = this.x = this.y = this.z = 0;
    this.stack.length = 0;
    this.f = -1;
  }

  /** set_rule (moves right) and put_rule. */
  private rule(advance: boolean): void {
    const a = this.s(4);
    const b = this.s(4);
    if (a > 0 && b > 0) this.emit({ t: 'rule', x: this.h, y: this.v, w: b, h: a });
    if (advance) this.h += b;
  }

  /** push, pop, right, w, x, down, y, z. */
  private move(o: number): void {
    if (o === 141) this.stack.push([this.h, this.v, this.w, this.x, this.y, this.z]);
    else if (o === 142) this.pop();
    else if (o <= 146) this.h += this.s(o - 142);
    else if (o <= 151) this.h += this.setRegister('w', o, 147);
    else if (o <= 156) this.h += this.setRegister('x', o, 152);
    else if (o <= 160) this.v += this.s(o - 156);
    else if (o <= 165) this.v += this.setRegister('y', o, 161);
    else this.v += this.setRegister('z', o, 166);
  }

  private pop(): void {
    const top = this.stack.pop();
    if (top) [this.h, this.v, this.w, this.x, this.y, this.z] = top;
  }

  /** Updates the w/x/y/z register for opcode `o` (`base` reuses it, the next four set it) and returns it. */
  private setRegister(name: 'w' | 'x' | 'y' | 'z', o: number, base: number): number {
    if (o !== base) this[name] = this.s(o - base);
    return this[name];
  }

  private setChar(code: number, move: boolean): void {
    const font = this.fonts.get(this.f);
    if (font?.kind !== 'tfm') return;
    this.emit({ t: 'char', font: this.f, x: this.h, y: this.v, code });
    if (!move) return;
    const adv = this.width(font, code);
    if (adv === undefined) this.missingWidths.add(font.name);
    this.h += adv ?? 0;
  }

  private special(len: number): void {
    const text = this.text(len, latin1);
    this.emit({ t: 'special', x: this.h, y: this.v, text });
  }

  private tfmFont(k: number): void {
    this.i += 4;
    const size = this.u(4);
    const designSize = this.u(4);
    const len = this.u(1) + this.u(1);
    this.fonts.set(k, { kind: 'tfm', name: this.text(len), size, designSize });
  }

  private nativeFont(): void {
    const k = this.u(4);
    const size = this.u(4);
    const flags = this.u(2);
    const name = this.text(this.u(1));
    const index = this.u(4);
    const rgba = flags & FLAG_COLORED ? this.u(4) : null;
    const extend = this.fixed(flags, FLAG_EXTEND, 1);
    const slant = this.fixed(flags, FLAG_SLANT, 0);
    const embolden = this.fixed(flags, FLAG_EMBOLDEN, 0);
    this.fonts.set(k, { kind: 'native', path: name.replace(/^\[(.*)\]$/, '$1'), index, size, rgba, extend, slant, embolden });
  }

  private fixed(flags: number, flag: number, none: number): number {
    return flags & flag ? this.s(4) / 65536 : none;
  }

  private glyphs(withText: boolean): void {
    if (withText) this.i += 2 * this.u(2);
    const advance = this.s(4);
    const n = this.u(2);
    const dx: number[] = [];
    const dy: number[] = [];
    const ids: number[] = [];
    for (let k = 0; k < n; k++) {
      dx.push(this.s(4));
      dy.push(this.s(4));
    }
    for (let k = 0; k < n; k++) ids.push(this.u(2));
    this.emit({ t: 'glyphs', font: this.f, x: this.h, y: this.v, dx, dy, glyphs: ids });
    this.h += advance;
  }
}

/** Parses the whole XDV (also a prefix ending at an eop); `from` skips the drawing of pages before that page number. */
export function parseXdv(bytes: Uint8Array, width: CharWidth, from = 1): ParsedXdv {
  return new XdvParser(bytes, width, from).run();
}
