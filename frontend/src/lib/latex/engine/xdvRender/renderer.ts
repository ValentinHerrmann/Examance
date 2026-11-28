/** Drawn pages (issue #352): renders a page of the XDV TeX has written so far, or says it cannot be drawn exactly (the pane then shows that page of the real PDF). */
import type { DrawContext } from './content';
import { drawPage, glyphsOf, scanDocument, type PageSize } from './draw';
import { FontStore, type FontTree, type OutlineSource, type PathLike } from './fonts';
import { NotDrawable } from './pdfObjects';
import { parseXdv, type ParsedXdv } from './xdv';

/** A canvas of the host: OffscreenCanvas in the worker, @napi-rs/canvas under Node. */
export interface CanvasHost<B> {
  create(width: number, height: number): { ctx: DrawContext; finish(): B };
  path(): PathLike;
}

export type RenderedPage<B> = { drawable: true; image: B; size: PageSize } | { drawable: false; reason: string; size: PageSize };

export class PageRenderer<B> {
  readonly fonts: FontStore;
  private readonly host: CanvasHost<B>;

  constructor(tree: FontTree, outline: OutlineSource, host: CanvasHost<B>) {
    this.host = host;
    this.fonts = new FontStore(tree, outline, () => host.path());
  }

  /** Parses the XDV, loading the TFM metrics it needs first. */
  async parse(xdv: Uint8Array): Promise<ParsedXdv> {
    let doc = parseXdv(xdv, this.fonts.charWidth);
    if (doc.missingWidths.size) {
      await this.fonts.loadMetrics(doc.missingWidths);
      doc = parseXdv(xdv, this.fonts.charWidth);
    }
    return doc;
  }

  /** Page `number` of `xdv` at `scale` device pixels per bp. */
  async render(xdv: Uint8Array, number: number, scale: number): Promise<RenderedPage<B>> {
    const doc = await this.parse(xdv);
    const scan = scanDocument(doc);
    const size = scan.sizes[number] ?? { width: 595.276, height: 841.89 };
    try {
      for (const { font, glyph } of glyphsOf(doc, scan, number)) {
        const f = doc.fonts.get(font);
        if (!f || !(await this.fonts.prepare(f, glyph))) throw new NotDrawable(`glyph ${glyph} of ${f?.kind === 'tfm' ? f.name : (f?.path ?? font)}`); // NOSONAR: glyphs load one by one from one font instance
      }
      const canvas = this.host.create(Math.ceil(size.width * scale), Math.ceil(size.height * scale));
      drawPage(canvas.ctx, doc, scan, number, this.fonts, scale);
      return { drawable: true, image: canvas.finish(), size };
    } catch (err) {
      if (err instanceof NotDrawable) return { drawable: false, reason: err.message, size };
      throw err;
    }
  }
}
