/** Booklet printing (issue #220, docs/dev/multi_sheet_exams.md): A4 copies imposed two-up onto A3 in saddle-stitch order, or split into one file per copy for a printer's own booklet function. The fold's cut zone is part of every page (Schulaufgabe.sty). */

import { MM } from './cutCorner';

/** One side of an A3 sheet: the 1-based A4 pages on its left and right half (0 = blank). */
export interface BookletSide {
  left: number;
  right: number;
}

/** Saddle-stitch order of an *n*-page booklet (n padded up to a multiple of 4 with blanks): per sheet its front, then its back. Printed duplex flipping on the short edge, folded and stapled, the pages read 1..n. */
export function bookletSides(n: number): BookletSide[] {
  const total = Math.ceil(n / 4) * 4;
  const page = (p: number) => (p <= n ? p : 0);
  const sides: BookletSide[] = [];
  for (let s = 0; s < total / 4; s++) {
    sides.push({ left: page(total - 2 * s), right: page(2 * s + 1) });
    sides.push({ left: page(2 * s + 2), right: page(total - 2 * s - 1) });
  }
  return sides;
}

/** *pdf* holds copies of *pagesPerCopy* A4 pages each; the result has every copy as its own A3 booklet, one after the other. */
export async function imposeBooklet(pdf: Uint8Array, pagesPerCopy: number): Promise<Uint8Array> {
  const lib = await import('pdf-lib');
  const src = await lib.PDFDocument.load(pdf);
  const out = await lib.PDFDocument.create();
  out.setTitle(src.getTitle() ?? '');
  const count = src.getPageCount();
  const embedded = await out.embedPages(src.getPages());
  const [w, h] = count ? [embedded[0].width, embedded[0].height] : [210 * MM, 297 * MM];
  for (let start = 0; start < count; start += pagesPerCopy) {
    const n = Math.min(pagesPerCopy, count - start);
    for (const side of bookletSides(n)) {
      const sheet = out.addPage([2 * w, h]);
      if (side.left) sheet.drawPage(embedded[start + side.left - 1], { x: 0, y: 0 });
      if (side.right) sheet.drawPage(embedded[start + side.right - 1], { x: w, y: 0 });
    }
  }
  return out.save();
}

/** *pdf* split into one PDF per copy of *pagesPerCopy* pages, named by *names* in order. */
export async function splitCopies(pdf: Uint8Array, pagesPerCopy: number, names: readonly string[]): Promise<{ name: string; pdf: Uint8Array }[]> {
  const lib = await import('pdf-lib');
  const src = await lib.PDFDocument.load(pdf);
  const files: { name: string; pdf: Uint8Array }[] = [];
  for (let start = 0, i = 0; start < src.getPageCount(); start += pagesPerCopy, i++) {
    const doc = await lib.PDFDocument.create();
    const indices = Array.from({ length: Math.min(pagesPerCopy, src.getPageCount() - start) }, (_, k) => start + k);
    for (const page of await doc.copyPages(src, indices)) doc.addPage(page);
    files.push({ name: names[i] ?? String(i + 1), pdf: await doc.save() });
  }
  return files;
}
