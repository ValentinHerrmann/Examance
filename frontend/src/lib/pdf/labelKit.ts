/** Drawing helpers for printed labels and slips (sticker sheet, share slips; issue #207): vector QR codes, text that fits its box, cut lines. pdf-lib is passed in so callers load it lazily. */

import type { PDFFont, PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';

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
