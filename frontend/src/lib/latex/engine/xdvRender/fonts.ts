/** Fonts of drawn pages (issue #352): OpenType fonts by the path XeTeX wrote, TFM fonts through dvipdfmx's map and encoding files to their Type1 files, outlines from the engine's FreeType kept as paths per session. */
import type { TfmFont, XdvFont } from './xdv';

/** What fonts need from the TeX Live tree (`LazyTree`). */
export interface FontTree {
  findFont(name: string): string | null;
  load(path: string): Promise<Uint8Array>;
}

/** `TexEngine.glyphOutline` of an instance that never typesets. */
export type OutlineSource = (path: string, index: number, glyph: number, name: string) => Promise<Int32Array | null>;

/** The parts of Path2D the renderer uses (OffscreenCanvas in the worker, @napi-rs/canvas under Node). */
export interface PathLike {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  closePath(): void;
}

/** A glyph in font units (y up); a null path is an empty glyph such as a space. */
export interface GlyphShape {
  path: PathLike | null;
  unitsPerEm: number;
}

/** How a TFM font is drawn: its Type1 file, the glyph name per character code (null: the file's own encoding), and the map's slant and extend. */
interface MappedFont {
  file: string;
  encoding: string[] | null;
  slant: number;
  extend: number;
}

interface Tfm {
  firstChar: number;
  /** Width index per character (0: no such character). */
  widthIndex: Uint8Array;
  /** Widths as fix_words. */
  widths: Int32Array;
}

/** TeX's scaling of a TFM fix_word to a font at size `z` (tex.web §571-575), so advances match the XDV to the sp. */
export function scaleFixWord(fw: number, z: number): number {
  let alpha = 16;
  while (z >= 0x800000) {
    z = Math.floor(z / 2);
    alpha += alpha;
  }
  const beta = 256 / alpha;
  alpha *= z;
  const b0 = (fw >>> 24) & 255, b1 = (fw >>> 16) & 255, b2 = (fw >>> 8) & 255, b3 = fw & 255;
  const sw = Math.floor((Math.floor((Math.floor((b3 * z) / 256) + b2 * z) / 256) + b1 * z) / beta);
  return b0 === 255 ? sw - alpha : sw;
}

export function parseTfm(bytes: Uint8Array): Tfm {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const half = (k: number) => dv.getUint16(k * 2);
  const lh = half(1), bc = half(2), ec = half(3), nw = half(4);
  const charBase = 6 + lh;
  const widthBase = charBase + (ec - bc + 1);
  const widthIndex = new Uint8Array(Math.max(0, ec - bc + 1));
  for (let c = bc; c <= ec; c++) widthIndex[c - bc] = bytes[(charBase + c - bc) * 4];
  const widths = new Int32Array(nw);
  for (let k = 0; k < nw; k++) widths[k] = dv.getInt32((widthBase + k) * 4);
  return { firstChar: bc, widthIndex, widths };
}

/** The entries of dvipdfmx's font map (`pdftex.map`): TFM name to Type1 file, encoding file and slant/extend. */
export function parseMap(text: string): Map<string, { file: string | null; enc: string | null; slant: number; extend: number }> {
  const map = new Map<string, { file: string | null; enc: string | null; slant: number; extend: number }>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || '%#*;'.includes(line[0])) continue;
    const quoted = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]).join(' ');
    const words = line.replaceAll(/"[^"]*"/g, ' ').split(/\s+/).filter(Boolean);
    let file: string | null = null, enc: string | null = null;
    for (const w of words.slice(1)) {
      if (!w.startsWith('<')) continue;
      const name = w.replace(/^<[<[]?/, '');
      if (name.endsWith('.enc')) enc = name;
      else file = name;
    }
    const num = (op: string) => {
      const m = new RegExp(`(-?[\\d.]+)\\s+${op}`).exec(quoted);
      return m ? Number(m[1]) : null;
    };
    if (!map.has(words[0])) map.set(words[0], { file, enc, slant: num('SlantFont') ?? 0, extend: num('ExtendFont') ?? 1 });
  }
  return map;
}

/** Glyph names of a PostScript encoding vector (`/Name [ /a /b … ] def`). */
export function parseEnc(text: string): string[] {
  const body = text.replaceAll(/%[^\n]*/g, '');
  const open = body.indexOf('[');
  const close = body.indexOf(']', open);
  return [...body.slice(open + 1, close).matchAll(/\/([^\s/[\]]+)/g)].map((m) => m[1]);
}

const SP_PER_BP = 65781.76;

export class FontStore {
  private map: ReturnType<typeof parseMap> | null = null;
  private readonly tfms = new Map<string, Tfm | null>();
  private readonly mapped = new Map<string, MappedFont | null>();
  private readonly encs = new Map<string, string[]>();
  private readonly shapes = new Map<string, GlyphShape | null>();
  private readonly tree: FontTree;
  private readonly outline: OutlineSource;
  private readonly makePath: () => PathLike;

  constructor(tree: FontTree, outline: OutlineSource, makePath: () => PathLike) {
    this.tree = tree;
    this.outline = outline;
    this.makePath = makePath;
  }

  /** Advance of a TFM character in sp, once its metrics are loaded (`loadMetrics`). */
  readonly charWidth = (font: TfmFont, code: number): number | undefined => {
    const tfm = this.tfms.get(font.name);
    if (tfm === undefined) return undefined;
    if (!tfm) return 0;
    const k = tfm.widthIndex[code - tfm.firstChar] ?? 0;
    return k ? scaleFixWord(tfm.widths[k], font.size) : 0;
  };

  /** Loads the TFM files of `names`; a missing one counts as width 0 and its font as not drawable. */
  async loadMetrics(names: Iterable<string>): Promise<void> {
    await Promise.all(
      [...names].filter((n) => !this.tfms.has(n)).map(async (name) => {
        const path = this.tree.findFont(`${name}.tfm`);
        this.tfms.set(name, path ? parseTfm(await this.tree.load(path)) : null);
      }),
    );
  }

  /** Size in bp of a font, the scale of its glyphs. */
  static sizeBp(font: XdvFont): number {
    return font.size / SP_PER_BP;
  }

  /** The map entry of a TFM font, or null when dvipdfmx would need something we do not draw (virtual or base-14 fonts). */
  private async mappedFont(font: TfmFont): Promise<MappedFont | null> {
    if (this.mapped.has(font.name)) return this.mapped.get(font.name) ?? null;
    if (!this.map) {
      const path = this.tree.findFont('pdftex.map');
      this.map = path ? parseMap(new TextDecoder().decode(await this.tree.load(path))) : new Map();
    }
    const entry = this.map.get(font.name);
    let result: MappedFont | null = null;
    const file = entry?.file ? this.tree.findFont(entry.file) : null;
    if (entry && file && /\.pf[ab]$/.test(file)) {
      let encoding: string[] | null = null;
      if (entry.enc) {
        const encPath = this.tree.findFont(entry.enc);
        if (encPath) {
          encoding = this.encs.get(encPath) ?? parseEnc(new TextDecoder().decode(await this.tree.load(encPath)));
          this.encs.set(encPath, encoding);
        }
      }
      if (!entry.enc || encoding) result = { file, encoding, slant: entry.slant, extend: entry.extend };
    }
    this.mapped.set(font.name, result);
    return result;
  }

  /** Slant and extend of a font, applied as a matrix around each glyph; synchronous once `prepare` ran for the font. */
  transformCached(font: XdvFont): { slant: number; extend: number } {
    if (font.kind === 'native') return { slant: font.slant, extend: font.extend };
    return this.mapped.get(font.name) ?? { slant: 0, extend: 1 };
  }

  /** Loads the shape of a glyph (glyph id of a native font, character code of a TFM font); false when it cannot be drawn exactly. */
  async prepare(font: XdvFont, glyph: number): Promise<boolean> {
    const key = await this.keyOf(font, glyph);
    if (!key) return false;
    if (!this.shapes.has(key.id)) {
      const data = await this.outline(key.path, key.index, key.glyph, key.name);
      this.shapes.set(key.id, data ? this.toShape(data) : null);
    }
    return this.shapes.get(key.id) !== null;
  }

  /** The shape `prepare` loaded, synchronously while drawing. */
  shape(font: XdvFont, glyph: number): GlyphShape | null {
    const id = this.idOf(font, glyph);
    return id ? (this.shapes.get(id) ?? null) : null;
  }

  private idOf(font: XdvFont, glyph: number): string | null {
    if (font.kind === 'native') return `${font.path}|${font.index}|${glyph}`;
    const m = this.mapped.get(font.name);
    if (!m) return null;
    const name = m.encoding ? m.encoding[glyph] : undefined;
    return name ? `${m.file}|n|${name}` : `${m.file}|c|${glyph}`;
  }

  private async keyOf(font: XdvFont, glyph: number) {
    if (font.kind === 'native') return font.path.startsWith('/') ? { id: this.idOf(font, glyph)!, path: font.path, index: font.index, glyph, name: '' } : null;
    const m = await this.mappedFont(font);
    if (!m) return null;
    const name = m.encoding ? m.encoding[glyph] : undefined;
    if (m.encoding && !name) return null;
    return { id: this.idOf(font, glyph)!, path: m.file, index: 0, glyph: name ? 0 : -(glyph + 1), name: name ?? '' };
  }

  private toShape(data: Int32Array): GlyphShape {
    const unitsPerEm = data[0] || 1000;
    if (data.length <= 2) return { path: null, unitsPerEm };
    const p = this.makePath();
    let open = false;
    for (let i = 2; i < data.length; ) {
      const op = data[i];
      if (op === 0) {
        if (open) p.closePath();
        p.moveTo(data[i + 1], data[i + 2]);
        open = true;
        i += 3;
      } else if (op === 1) {
        p.lineTo(data[i + 1], data[i + 2]);
        i += 3;
      } else if (op === 2) {
        p.quadraticCurveTo(data[i + 1], data[i + 2], data[i + 3], data[i + 4]);
        i += 5;
      } else {
        p.bezierCurveTo(data[i + 1], data[i + 2], data[i + 3], data[i + 4], data[i + 5], data[i + 6]);
        i += 7;
      }
    }
    if (open) p.closePath();
    return { path: p, unitsPerEm };
  }
}
