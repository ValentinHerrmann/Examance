/** Booklet printing (issue #220, docs/dev/multi_sheet_exams.md): A4 copies imposed two-up onto A3 in saddle-stitch order, or split into one file per copy for a printer's own booklet function. The fold's cut zone is part of every page (Schulaufgabe.sty). */

import type { PDFPage } from 'pdf-lib';
import { embedLabelFonts, type PdfLib } from '#lib/pdf/labelKit';
import { MAX_BOOKLET_OFFSET } from '#lib/exam/printLayout';
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
    sides.push({ left: page(total - 2 * s), right: page(2 * s + 1) }, { left: page(2 * s + 2), right: page(total - 2 * s - 1) });
  }
  return sides;
}

/** The printed fold: a thin line over the full height where the two pages meet, with heavier ticks at the top and bottom to set a guillotine on; cut and fold on it, not by measuring from the paper edge (issue #228). */
function drawFoldMark(lib: PdfLib, sheet: PDFPage, x: number, h: number): void {
  const color = lib.rgb(0.35, 0.35, 0.35);
  sheet.drawLine({ start: { x, y: 0 }, end: { x, y: h }, thickness: 0.4, color });
  for (const [from, to] of [[5 * MM, 15 * MM], [h - 15 * MM, h - 5 * MM]]) sheet.drawLine({ start: { x, y: from }, end: { x, y: to }, thickness: 1.2, color });
}

/** *pdf* holds copies of *pagesPerCopy* A4 pages each; the result has every copy as its own A3 booklet, one after the other. *offsetMm* shifts every sheet's content to the right (negative: left), for a printer that prints off-centre (issue #228). */
export async function imposeBooklet(pdf: Uint8Array, pagesPerCopy: number, offsetMm = 0): Promise<Uint8Array> {
  const lib = await import('pdf-lib');
  const src = await lib.PDFDocument.load(pdf);
  const out = await lib.PDFDocument.create();
  out.setTitle(src.getTitle() ?? '');
  const count = src.getPageCount();
  const embedded = await out.embedPages(src.getPages());
  const [w, h] = count ? [embedded[0].width, embedded[0].height] : [210 * MM, 297 * MM];
  const dx = offsetMm * MM;
  for (let start = 0; start < count; start += pagesPerCopy) {
    const n = Math.min(pagesPerCopy, count - start);
    for (const side of bookletSides(n)) {
      const sheet = out.addPage([2 * w, h]);
      if (side.left) sheet.drawPage(embedded[start + side.left - 1], { x: dx, y: 0 });
      if (side.right) sheet.drawPage(embedded[start + side.right - 1], { x: w + dx, y: 0 });
      drawFoldMark(lib, sheet, w + dx, h);
    }
  }
  return out.save();
}

/** Texts of the booklet test sheet, in the teacher's language. */
export interface BookletTestTexts {
  title: string;
  /** One instruction per line. */
  steps: string[];
  front: string;
  back: string;
}

/** A two-sided A3 test sheet (issue #228): printed like a booklet and folded edge to edge, the crease crosses a ruler around the printed centre and shows the shift to enter as the booklet offset (right of the centre: positive). */
export async function bookletTestSheet(texts: BookletTestTexts): Promise<Uint8Array> {
  const lib = await import('pdf-lib');
  const out = await lib.PDFDocument.create();
  out.setTitle(texts.title);
  const fonts = await embedLabelFonts(lib, out);
  const [w, h] = [420 * MM, 297 * MM];
  const ink = lib.rgb(0, 0, 0);
  for (const side of [texts.front, texts.back]) {
    const page = out.addPage([w, h]);
    const cx = w / 2;
    page.drawLine({ start: { x: cx, y: 0 }, end: { x: cx, y: h }, thickness: 0.4, color: lib.rgb(0.35, 0.35, 0.35) });
    let y = h - 25 * MM;
    page.drawText(fonts.safe(`${texts.title} · ${side}`), { x: 25 * MM, y, size: 16, font: fonts.bold, color: ink });
    for (const line of texts.steps) {
      y -= 7 * MM;
      page.drawText(fonts.safe(line), { x: 25 * MM, y, size: 11, font: fonts.regular, color: ink });
    }
    // Three rulers, so a slanted feed shows too.
    for (const at of [h * 0.55, h * 0.35, h * 0.15]) {
      for (let mm = -MAX_BOOKLET_OFFSET; mm <= MAX_BOOKLET_OFFSET; mm++) {
        const x = cx + mm * MM;
        const long = mm % 5 === 0 ? 6 * MM : 3 * MM;
        page.drawLine({ start: { x, y: at }, end: { x, y: at + long }, thickness: mm === 0 ? 0.8 : 0.4, color: ink });
        if (mm % 5 === 0) {
          const label = mm > 0 ? `+${mm}` : String(mm);
          page.drawText(label, { x: x - fonts.regular.widthOfTextAtSize(label, 9) / 2, y: at - 4.5 * MM, size: 9, font: fonts.regular, color: ink });
        }
      }
      page.drawLine({ start: { x: cx - MAX_BOOKLET_OFFSET * MM, y: at }, end: { x: cx + MAX_BOOKLET_OFFSET * MM, y: at }, thickness: 0.4, color: ink });
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
    const doc = await lib.PDFDocument.create(); // NOSONAR: one copy's file at a time keeps memory flat for large classes
    const indices = Array.from({ length: Math.min(pagesPerCopy, src.getPageCount() - start) }, (_, k) => start + k);
    for (const page of await doc.copyPages(src, indices)) doc.addPage(page); // NOSONAR: as above
    files.push({ name: names[i] ?? String(i + 1), pdf: await doc.save() }); // NOSONAR: as above
  }
  return files;
}
