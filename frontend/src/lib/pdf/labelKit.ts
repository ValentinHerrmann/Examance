/** Drawing helpers for printed labels and slips (sticker sheet, share slips; issue #207): vector QR codes, text that fits its box, cut lines. pdf-lib is passed in so callers load it lazily. */

import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { makeSafeText } from '#lib/export/summaryPdf';

export type PdfLib = typeof import('pdf-lib');

/** 1 cm in PDF points. */
export const CM = 28.3465;
export const A4 = { width: 595.28, height: 841.89 };

/** Draws *text* as a QR code with its bottom-left corner at (x, y): vector modules, so it scans sharply at any print size. Level M, like the scanner expects of stickers. */
export function drawQr(lib: PdfLib, page: PDFPage, text: string, x: number, y: number, size: number): void {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const quiet = 1;
  const cell = size / (modules.size + 2 * quiet);
  const black = lib.rgb(0, 0, 0);
  for (let row = 0; row < modules.size; row++) {
    let col = 0;
    while (col < modules.size) {
      if (!modules.get(row, col)) {
        col++;
        continue;
      }
      // One rectangle per run of dark modules keeps the page small.
      const start = col;
      while (col < modules.size && modules.get(row, col)) col++;
      page.drawRectangle({
        x: x + (start + quiet) * cell,
        y: y + size - (row + 1 + quiet) * cell,
        width: (col - start) * cell,
        height: cell,
        color: black,
      });
    }
  }
}

/** *text* shortened with an ellipsis until it fits *maxWidth*. */
export function fitText(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** *text* broken into lines of at most *maxWidth*: at spaces, or anywhere for long words such as URLs. */
export function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= maxWidth;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (fits(candidate)) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const ch of word) {
      if (!fits(line + ch)) {
        lines.push(line);
        line = '';
      }
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** A light dashed frame to cut along. */
export function cutFrame(lib: PdfLib, page: PDFPage, x: number, y: number, width: number, height: number): void {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: lib.rgb(0.75, 0.75, 0.75),
    borderWidth: 0.4,
    borderDashArray: [3, 3],
  });
}

export interface LabelFonts {
  regular: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
  monoBold: PDFFont;
  /** Replaces letters outside WinAnsi, which pdf-lib's standard fonts cannot draw. */
  safe: (text: string) => string;
}

export async function embedLabelFonts(lib: PdfLib, pdf: PDFDocument): Promise<LabelFonts> {
  const regular = await pdf.embedFont(lib.StandardFonts.Helvetica);
  return {
    regular,
    bold: await pdf.embedFont(lib.StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(lib.StandardFonts.Courier),
    monoBold: await pdf.embedFont(lib.StandardFonts.CourierBold),
    safe: makeSafeText(regular),
  };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Small slips with a name and a code (`drawKeySlip`), 24 per A4 page. */
export const KEY_SLIP_GRID = { cols: 3, rows: 8 } as const;

/** Draws *count* items onto as many A4 pages of a *cols* × *rows* grid as they need. */
export function placeOnPages(
  lib: PdfLib,
  pdf: PDFDocument,
  grid: { cols: number; rows: number },
  count: number,
  draw: (page: PDFPage, box: Box, index: number) => void
): void {
  const place = slipGrid(grid.cols, grid.rows);
  const perPage = grid.cols * grid.rows;
  let page: PDFPage | null = null;
  for (let i = 0; i < count; i++) {
    const slot = i % perPage;
    if (!page || slot === 0) page = pdf.addPage([A4.width, A4.height]);
    draw(page, place(slot), i);
  }
}

/** Slots of an A4 page split into *cols* × *rows* slips inside a 1 cm margin, numbered row by row. */
export function slipGrid(cols: number, rows: number, margin = CM): (slot: number) => Box {
  const w = (A4.width - 2 * margin) / cols;
  const h = (A4.height - 2 * margin) / rows;
  return (slot) => ({ x: margin + (slot % cols) * w, y: A4.height - margin - (Math.floor(slot / cols) + 1) * h, w, h });
}

export interface KeySlip {
  name: string;
  /** e.g. the exam title. */
  subtitle?: string;
  title: string;
  /** Printed as `ABCD-EFGH`. */
  code: string;
  note?: string;
}

/** A small cut-out slip with a name and a code to keep: the share codes and the sticker keys both use it. */
export function drawKeySlip(lib: PdfLib, page: PDFPage, fonts: LabelFonts, slip: KeySlip, box: Box, formatCode: (code: string) => string): void {
  cutFrame(lib, page, box.x, box.y, box.w, box.h);
  const pad = 8;
  const width = box.w - 2 * pad;
  let y = box.y + box.h - pad - 8;
  page.drawText(fitText(fonts.bold, fonts.safe(slip.name), 8, width), { x: box.x + pad, y, size: 8, font: fonts.bold });
  if (slip.subtitle) {
    y -= 10;
    page.drawText(fitText(fonts.regular, fonts.safe(slip.subtitle), 6.5, width), { x: box.x + pad, y, size: 6.5, font: fonts.regular });
  }
  y -= 12;
  page.drawText(fitText(fonts.regular, fonts.safe(slip.title), 6.5, width), { x: box.x + pad, y, size: 6.5, font: fonts.regular });
  const code = formatCode(slip.code);
  const codeY = slip.note ? box.y + pad + 16 : box.y + pad + 4;
  page.drawText(code, { x: box.x + (box.w - fonts.monoBold.widthOfTextAtSize(code, 13)) / 2, y: codeY, size: 13, font: fonts.monoBold });
  if (slip.note) {
    const line = fitText(fonts.regular, fonts.safe(slip.note), 5.5, width);
    page.drawText(line, { x: box.x + pad, y: box.y + pad, size: 5.5, font: fonts.regular });
  }
}
