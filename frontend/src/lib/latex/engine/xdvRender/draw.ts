/** Scans an XDV for what a page needs from the pages before it, and draws one page on a canvas as xdvipdfmx would write it into the PDF (drawn pages, issue #352). */
import type { DrawContext } from './content';
import type { FontStore } from './fonts';
import { NotDrawable } from './pdfObjects';
import { PageDrawer } from './pageDrawer';
import { A4, colourSpecial, command, dim, type Colour, type DocumentScan, type Form, type PageSize } from './specials';
import type { ParsedXdv, XdvItem } from './xdv';

export type { DocumentScan, PageSize };

/** Collects forms, the colour stack at each page's start and the paper size, over the whole document. */
export function scanDocument(doc: ParsedXdv): DocumentScan {
  const scanner = new Scanner();
  for (const page of doc.pages) {
    scanner.beginPage(page.number);
    for (const item of page.items) scanner.item(item);
  }
  return { sizes: scanner.sizes, forms: scanner.forms, coloursAtStart: scanner.coloursAtStart };
}

class Scanner {
  readonly forms = new Map<string, Form>();
  readonly coloursAtStart: Colour[][] = [];
  readonly sizes: PageSize[] = [];
  private readonly stack: Colour[] = [];
  private size = A4;
  private pageNo = 0;
  private recording: { name: string; form: Form } | null = null;

  beginPage(number: number): void {
    this.pageNo = number;
    this.coloursAtStart[number] = this.stack.map((c) => ({ ...c }));
    this.sizes[number] = this.size;
    this.recording = null;
  }

  item(item: XdvItem): void {
    if (item.t !== 'special') {
      this.recording?.form.items.push(item);
      return;
    }
    const { cmd, rest } = command(item.text);
    if (cmd === 'pdf:bxobj') this.beginForm(item, rest);
    else if (cmd === 'pdf:exobj' && this.recording) {
      this.forms.set(this.recording.name, this.recording.form);
      this.recording = null;
    } else if (this.recording) this.recording.form.items.push(item);
    else if (cmd === 'papersize' || cmd === 'pdf:pagesize') this.setPaper(cmd, rest);
    else this.colour(cmd, rest);
  }

  private beginForm(item: Extract<XdvItem, { t: 'special' }>, rest: string): void {
    const words = rest.split(/\s+/);
    const get = (k: string) => dim(words[words.indexOf(k) + 1] ?? '0');
    this.recording = { name: words[0], form: { items: [], x: item.x, y: item.y, width: get('width'), height: get('height'), depth: get('depth') } };
  }

  private setPaper(cmd: string, rest: string): void {
    const words = rest.split(/[\s,]+/);
    const [w, h] = cmd === 'papersize' ? words.map(dim) : [dim(words[words.indexOf('width') + 1] ?? ''), dim(words[words.indexOf('height') + 1] ?? '')];
    if (w > 0 && h > 0) this.size = this.sizes[this.pageNo] = { width: w, height: h };
  }

  private colour(cmd: string, rest: string): void {
    try {
      colourSpecial(this.stack, cmd, rest);
    } catch {
      // The page that uses it is not drawable; the stack stays as it was.
    }
  }
}

/** Draws page `number` on `ctx` at `scale` device pixels per bp; throws NotDrawable for anything it would not draw exactly. Fonts must be prepared (`glyphsOf`). */
export function drawPage(ctx: DrawContext, doc: ParsedXdv, scan: DocumentScan, number: number, fonts: FontStore, scale: number): void {
  const page = doc.pages.find((p) => p.number === number);
  if (!page) throw new NotDrawable('no such page');
  new PageDrawer(ctx, doc, scan, fonts, scale, number).draw(page.items);
}

/** The glyphs a page draws (its own and those of the forms it uses), for `FontStore.prepare`. */
export function glyphsOf(doc: ParsedXdv, scan: DocumentScan, number: number): { font: number; glyph: number }[] {
  const out = new Map<string, { font: number; glyph: number }>();
  const visit = (items: XdvItem[]) => {
    for (const item of items) {
      if (item.t === 'char') out.set(`${item.font}:${item.code}`, { font: item.font, glyph: item.code });
      else if (item.t === 'glyphs') for (const g of item.glyphs) out.set(`${item.font}:${g}`, { font: item.font, glyph: g });
      else if (item.t === 'special' && /^pdf:\s*uxobj/.test(item.text.trimStart())) {
        const form = scan.forms.get(command(item.text).rest.split(/\s+/)[0]);
        if (form) visit(form.items);
      }
    }
  };
  visit(doc.pages.find((p) => p.number === number)?.items ?? []);
  return [...out.values()];
}
