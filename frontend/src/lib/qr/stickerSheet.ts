/** QR name stickers for exam sheets (issues #83, #207): A4 label sheet, 5 × 7 cells, DiRueLei-compatible payload (`Lastname, Firstname_ID`, read back by `parseStudentQr`; entries come from the exam's students, `lib/students/classList.ts`). With personal keys, the first sticker of each student carries a strip with name and key above the QR code: cut it off and hand it over before the sticker goes onto the paper (labels are expensive). Key slips alone go on plain paper. */

import type { PDFPage } from 'pdf-lib';
import { personalKey } from '#lib/crypto/stickerKey';
import { translate } from '#lib/i18n';
import {
  A4,
  CM,
  drawKeySlip,
  drawQr,
  embedLabelFonts,
  fitText,
  KEY_SLIP_GRID,
  placeOnPages,
  type LabelFonts,
  type PdfLib,
} from '#lib/pdf/labelKit';
import { formatCode } from '#lib/sharing/shareCrypto';

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
  /** Put name and personal key on a strip above each student's first QR code. */
  keys: boolean;
  /** Only the key slips, on plain paper, for students who already carry a sticker. */
  keysOnly: boolean;
}

export const STICKER_GRID = { cols: 5, rows: 7 } as const;
const LEFT = 0.7 * CM;
const TOP = 1 * CM;
const PITCH = 4 * CM;
const CELL = 3.5 * CM;
const QR_SIZE = 2.6 * CM;
/** With a key strip: the strip's height and the smaller QR below it (DiRueLei prints 2 cm). */
const STRIP = 0.95 * CM;
const QR_WITH_STRIP = 2.2 * CM;

interface Cell {
  entry: StickerEntry;
  /** The key on this sticker's cut-off strip, only on a student's first copy. */
  key: string | null;
}

async function cellsFor(entries: readonly StickerEntry[], options: StickerSheetOptions): Promise<Cell[]> {
  const cells: Cell[] = [];
  for (const entry of entries) {
    const key = options.keys ? await personalKey(entry.payload) : null;
    for (let i = 0; i < Math.max(1, options.copies); i++) cells.push({ entry, key: i === 0 ? key : null });
  }
  return cells;
}

function drawQrCell(lib: PdfLib, page: PDFPage, fonts: LabelFonts, { entry, key }: Cell, x: number, y: number): void {
  if (!key) {
    const label = fitText(fonts.regular, fonts.safe(entry.label), 7, CELL - 6);
    page.drawText(label, { x: x + (CELL - fonts.regular.widthOfTextAtSize(label, 7)) / 2, y: y + CELL - 11, size: 7, font: fonts.regular });
    drawQr(lib, page, entry.payload, x + (CELL - QR_SIZE) / 2, y + (CELL - QR_SIZE) / 2 - 6, QR_SIZE);
    return;
  }
  // Strip: name and key, above a dashed cut line; the QR part below goes onto the paper.
  const name = fitText(fonts.bold, fonts.safe(entry.label), 7, CELL - 6);
  page.drawText(name, { x: x + (CELL - fonts.bold.widthOfTextAtSize(name, 7)) / 2, y: y + CELL - 10, size: 7, font: fonts.bold });
  const code = formatCode(key);
  page.drawText(code, { x: x + (CELL - fonts.monoBold.widthOfTextAtSize(code, 10)) / 2, y: y + CELL - 22, size: 10, font: fonts.monoBold });
  const cutY = y + CELL - STRIP;
  page.drawLine({
    start: { x, y: cutY },
    end: { x: x + CELL, y: cutY },
    thickness: 0.5,
    color: lib.rgb(0.55, 0.55, 0.55),
    dashArray: [2, 2],
  });
  const below = CELL - STRIP;
  drawQr(lib, page, entry.payload, x + (CELL - QR_WITH_STRIP) / 2, y + (below - QR_WITH_STRIP) / 2, QR_WITH_STRIP);
}

/** Key slips on plain paper: name, key and a note to keep it, for students whose sticker is already in use. */
async function renderKeySlips(entries: readonly StickerEntry[]): Promise<Uint8Array> {
  const lib = await import('pdf-lib');
  const pdf = await lib.PDFDocument.create();
  pdf.setTitle(translate('sharing.stickers.keyTitle'));
  const fonts = await embedLabelFonts(lib, pdf);
  const keys = await Promise.all(entries.map((e) => personalKey(e.payload)));
  const title = translate('sharing.stickers.keyTitle');
  const note = translate('sharing.stickers.keyNoteShort');
  placeOnPages(lib, pdf, KEY_SLIP_GRID, entries.length, (page, box, i) =>
    drawKeySlip(lib, page, fonts, { name: entries[i].label, title, code: keys[i], note }, box, formatCode)
  );
  if (pdf.getPageCount() === 0) pdf.addPage([A4.width, A4.height]);
  return pdf.save();
}

export async function renderStickerSheet(entries: readonly StickerEntry[], options: StickerSheetOptions): Promise<Uint8Array> {
  if (options.keysOnly) return renderKeySlips(entries);
  const lib = await import('pdf-lib');
  const pdf = await lib.PDFDocument.create();
  pdf.setTitle(translate('sharing.stickers.pdfTitle'));
  const fonts = await embedLabelFonts(lib, pdf);
  const perPage = STICKER_GRID.cols * STICKER_GRID.rows;
  const cells = await cellsFor(entries, options);
  let page: PDFPage | null = null;
  const skip = Math.max(0, Math.min(perPage - 1, Math.floor(options.skip)));
  cells.forEach((cell, i) => {
    const slot = (i + skip) % perPage;
    if (!page || slot === 0) page = pdf.addPage([A4.width, A4.height]);
    const col = slot % STICKER_GRID.cols;
    const row = Math.floor(slot / STICKER_GRID.cols);
    drawQrCell(lib, page, fonts, cell, LEFT + col * PITCH, A4.height - TOP - row * PITCH - CELL);
  });
  if (!page) pdf.addPage([A4.width, A4.height]);
  return pdf.save();
}
