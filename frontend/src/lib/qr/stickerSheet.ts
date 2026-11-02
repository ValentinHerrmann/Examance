/** QR name stickers for exam sheets (issues #83, #207): A4 label sheet, 5 × 7 cells, DiRueLei-compatible payload (`Lastname, Firstname_ID`, read back by `parseStudentQr`). With personal keys, each student also gets a key slip to keep, which unlocks a result link shared with the `sticker` factor. */

import type { PDFFont, PDFPage } from 'pdf-lib';
import { personalKey, stickerId } from '#lib/crypto/stickerKey';
import { makeSafeText } from '#lib/export/summaryPdf';
import { translate } from '#lib/i18n';
import { A4, CM, cutFrame, drawQr, fitText, wrapText, type PdfLib } from '#lib/pdf/labelKit';
import { formatCode } from '#lib/sharing/shareCrypto';
import { parseRosterLines } from '#lib/utils/rosterLines';
import { formatStudentName, formatStudentQr } from '#lib/utils/studentQr';

export interface StickerEntry {
  /** Printed above the QR code and on the key slip. */
  label: string;
  /** The QR text; the scan stores it as the student's raw id. */
  payload: string;
}

export interface StickerSheetOptions {
  /** Cells already used on the first label sheet. */
  skip: number;
  /** QR stickers per student (an exam with several sheets needs several). */
  copies: number;
  /** Add a personal key slip per student. */
  keys: boolean;
  /** Only the key slips, for students who already carry a sticker. */
  keysOnly: boolean;
}

export const STICKER_GRID = { cols: 5, rows: 7 } as const;
const LEFT = 0.7 * CM;
const TOP = 1 * CM;
const PITCH = 4 * CM;
const CELL = 3.5 * CM;
const QR_SIZE = 2.6 * CM;

/** Entries from a pasted list: one student per line, `Lastname, Firstname` then an optional id, split on tab or `;`. A missing id becomes the stable `stickerId` of the name. */
export async function entriesFromRoster(text: string): Promise<StickerEntry[]> {
  const entries: StickerEntry[] = [];
  for (const [name, id] of parseRosterLines(text, /[\t;]/)) {
    if (!name) continue;
    entries.push({ label: formatStudentName(name), payload: formatStudentQr(name, id || (await stickerId(name))) });
  }
  return entries;
}

type Cell = { kind: 'qr'; entry: StickerEntry } | { kind: 'key'; entry: StickerEntry; key: string };

async function cellsFor(entries: readonly StickerEntry[], options: StickerSheetOptions): Promise<Cell[]> {
  const cells: Cell[] = [];
  for (const entry of entries) {
    if (!options.keysOnly) for (let i = 0; i < Math.max(1, options.copies); i++) cells.push({ kind: 'qr', entry });
    if (options.keys || options.keysOnly) cells.push({ kind: 'key', entry, key: await personalKey(entry.payload) });
  }
  return cells;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
  safe: (text: string) => string;
}

function drawQrCell(lib: PdfLib, page: PDFPage, fonts: Fonts, entry: StickerEntry, x: number, y: number): void {
  const label = fitText(fonts.regular, fonts.safe(entry.label), 7, CELL - 6);
  page.drawText(label, { x: x + (CELL - fonts.regular.widthOfTextAtSize(label, 7)) / 2, y: y + CELL - 11, size: 7, font: fonts.regular });
  drawQr(lib, page, entry.payload, x + (CELL - QR_SIZE) / 2, y + (CELL - QR_SIZE) / 2 - 6, QR_SIZE);
}

function drawKeyCell(lib: PdfLib, page: PDFPage, fonts: Fonts, entry: StickerEntry, key: string, x: number, y: number): void {
  cutFrame(lib, page, x, y, CELL, CELL);
  const inner = CELL - 8;
  const name = fitText(fonts.bold, fonts.safe(entry.label), 7, inner);
  page.drawText(name, { x: x + 4, y: y + CELL - 12, size: 7, font: fonts.bold });
  const title = fitText(fonts.regular, fonts.safe(translate('sharing.stickers.keyTitle')), 6.5, inner);
  page.drawText(title, { x: x + 4, y: y + CELL - 24, size: 6.5, font: fonts.regular });
  const code = formatCode(key);
  page.drawText(code, { x: x + (CELL - fonts.mono.widthOfTextAtSize(code, 12)) / 2, y: y + CELL / 2 - 2, size: 12, font: fonts.mono });
  const note = wrapText(fonts.regular, fonts.safe(translate('sharing.stickers.keyNote')), 5.5, inner);
  note.slice(0, 4).forEach((line, i) => page.drawText(line, { x: x + 4, y: y + 22 - i * 7, size: 5.5, font: fonts.regular }));
}

export async function renderStickerSheet(entries: readonly StickerEntry[], options: StickerSheetOptions): Promise<Uint8Array> {
  const lib = await import('pdf-lib');
  const pdf = await lib.PDFDocument.create();
  pdf.setTitle(translate('sharing.stickers.pdfTitle'));
  const regular = await pdf.embedFont(lib.StandardFonts.Helvetica);
  const fonts: Fonts = {
    regular,
    bold: await pdf.embedFont(lib.StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(lib.StandardFonts.CourierBold),
    safe: makeSafeText(regular),
  };
  const perPage = STICKER_GRID.cols * STICKER_GRID.rows;
  const cells = await cellsFor(entries, options);
  let page: PDFPage | null = null;
  const skip = Math.max(0, Math.min(perPage - 1, Math.floor(options.skip)));
  cells.forEach((cell, i) => {
    const slot = (i + skip) % perPage;
    if (!page || slot === 0) page = pdf.addPage([A4.width, A4.height]);
    const col = slot % STICKER_GRID.cols;
    const row = Math.floor(slot / STICKER_GRID.cols);
    const x = LEFT + col * PITCH;
    const y = A4.height - TOP - row * PITCH - CELL;
    if (cell.kind === 'qr') drawQrCell(lib, page, fonts, cell.entry, x, y);
    else drawKeyCell(lib, page, fonts, cell.entry, cell.key, x, y);
  });
  if (!page) pdf.addPage([A4.width, A4.height]);
  return pdf.save();
}
