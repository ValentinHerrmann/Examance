/** Personalised exam copies (issue #211): the compiled student sheet once per student, with their QR code in the sticker box and a cut-off corner tab with name and personal key at page 1's top-right corner. Same payload as a sticker, so scans, keys and result sharing work unchanged. */

import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import { personalKey } from '#lib/crypto/stickerKey';
import { translate } from '#lib/i18n';
import { CM, drawQr, embedLabelFonts, fitText, type LabelFonts, type PdfLib } from '#lib/pdf/labelKit';
import { loadPdfjs } from '#lib/pdf/pdfjs';
import { formatCode } from '#lib/sharing/shareCrypto';
import { MM, TAB_SIDE, TAB_TOP } from './cutCorner';
import type { StickerEntry } from './stickerSheet';

export interface ExamCopiesOptions {
  examTitle: string;
  /** Pads every copy to an even page count, so each student starts on a new sheet. */
  duplex: boolean;
}

type Rect = [number, number, number, number];

/** QR size like a sticker's; smaller only if the box is. */
const QR_SIZE = 2.6 * CM;
const HYPOTENUSE = Math.hypot(TAB_TOP, TAB_SIDE);
const ANGLE = (Math.atan2(TAB_SIDE, TAB_TOP) * 180) / Math.PI;
const SIN = TAB_SIDE / HYPOTENUSE;
const COS = TAB_TOP / HYPOTENUSE;
/** Clearance of the tab text from the cut line (perpendicular) and from the paper edges (unprintable margin). */
const CLEAR = 3 * MM;
const EDGE = 4 * MM;
/** Name and key rows: baseline depth below the top edge, preferred and smallest font size. */
const NAME_ROW = { depth: 6.5 * MM, size: 9, minSize: 7 };
const KEY_ROW = { depth: 10.7 * MM, size: 8.5, minSize: 7 };
const HINT_SIZE = 5.5;
/** The hint's baseline outside the cut line, so the hint sits in the 3 mm tolerance zone with its glyphs rising towards the line. */
const HINT_OFFSET = 2.2 * MM;

/** The sticker box of page 1 (`omr://__qr__` in Schulaufgabe.sty), in PDF points. */
async function findQrBox(examPdf: Uint8Array): Promise<Rect | null> {
  const pdfjs = await loadPdfjs();
  // A copy: pdf.js detaches the buffer it is given, which would empty the caller's (cached) bytes.
  const task = pdfjs.getDocument({ data: examPdf.slice() });
  const doc = await task.promise;
  try {
    const annotations = await (await doc.getPage(1)).getAnnotations();
    const link = annotations.find((a) => a.subtype === 'Link' && (a.unsafeUrl ?? a.url) === 'omr://__qr__');
    return link ? (link.rect as Rect) : null;
  } finally {
    await task.destroy();
  }
}

/** Width a horizontal line may take at *descent* below the top edge: right-aligned EDGE from the right edge, its lower left corner CLEAR (perpendicular) from the cut line. */
function roomAt(descent: number): number {
  return TAB_TOP * (1 - descent / TAB_SIDE) - CLEAR / SIN - EDGE;
}

/** One right-aligned row of the tab; a long text shrinks in 0.5 pt steps down to the row's smallest size before it is shortened. */
function drawTabRow(page: PDFPage, font: PDFFont, text: string, row: { depth: number; size: number; minSize: number }): void {
  const { width, height } = page.getSize();
  // The lowest glyph point is the one closest to the line, so the room is measured at the font's descender.
  const room = (size: number) => roomAt(row.depth + font.heightAtSize(size) - font.heightAtSize(size, { descender: false }));
  let size = row.size;
  while (size > row.minSize && font.widthOfTextAtSize(text, size) > room(size)) size -= 0.5;
  const line = fitText(font, text, size, room(size));
  page.drawText(line, { x: width - EDGE - font.widthOfTextAtSize(line, size), y: height - row.depth, size, font });
}

/** The corner tab on page 1: a dashed diagonal, name and key horizontal in the corner at least 3 mm from the line and 4 mm from the edges, and a hint along the line on the side that stays. */
function drawCornerTab(lib: PdfLib, page: PDFPage, fonts: LabelFonts, entry: StickerEntry, key: string): void {
  const { width, height } = page.getSize();
  page.drawLine({
    start: { x: width - TAB_TOP, y: height },
    end: { x: width, y: height - TAB_SIDE },
    thickness: 0.6,
    color: lib.rgb(0.5, 0.5, 0.5),
    dashArray: [4, 3],
  });
  drawTabRow(page, fonts.bold, fonts.safe(entry.label), NAME_ROW);
  drawTabRow(page, fonts.monoBold, formatCode(key), KEY_ROW);
  const hint = fitText(fonts.regular, fonts.safe(translate('sharing.stickers.cornerHint')), HINT_SIZE, HYPOTENUSE - 2 * EDGE / SIN);
  const along = (HYPOTENUSE - fonts.regular.widthOfTextAtSize(hint, HINT_SIZE)) / 2;
  // Along the line (COS, -SIN) from its top end, then outward (-SIN, -COS), away from the corner.
  page.drawText(hint, {
    x: width - TAB_TOP + COS * along - SIN * HINT_OFFSET,
    y: height - SIN * along - COS * HINT_OFFSET,
    size: HINT_SIZE,
    font: fonts.regular,
    color: lib.rgb(0.4, 0.4, 0.4),
    rotate: lib.degrees(-ANGLE),
  });
}

async function addCopy(lib: PdfLib, out: PDFDocument, src: PDFDocument, fonts: LabelFonts, entry: StickerEntry, qrBox: Rect, options: ExamCopiesOptions): Promise<void> {
  const pages = await out.copyPages(src, src.getPageIndices());
  for (const page of pages) out.addPage(page);
  const first = pages[0];
  const [x0, y0, x1, y1] = qrBox;
  const size = Math.min(QR_SIZE, x1 - x0 - 0.3 * CM, y1 - y0 - 0.3 * CM);
  drawQr(lib, first, entry.payload, (x0 + x1 - size) / 2, (y0 + y1 - size) / 2, size);
  drawCornerTab(lib, first, fonts, entry, await personalKey(entry.payload));
  if (options.duplex && pages.length % 2 === 1) {
    const { width, height } = pages[pages.length - 1].getSize();
    out.addPage([width, height]);
  }
}

/** One PDF with a copy of *examPdf* (the student sheet, compiled with the exam's `cutCorner` option) per entry, in list order. */
export async function renderExamCopies(examPdf: Uint8Array, entries: readonly StickerEntry[], options: ExamCopiesOptions): Promise<Uint8Array> {
  const qrBox = await findQrBox(examPdf);
  if (!qrBox) throw new Error(translate('sharing.stickers.noQrBox'));
  const lib = await import('pdf-lib');
  const src = await lib.PDFDocument.load(examPdf);
  const out = await lib.PDFDocument.create();
  out.setTitle(options.examTitle || translate('sharing.stickers.copiesTitle'));
  const fonts = await embedLabelFonts(lib, out);
  for (const entry of entries) await addCopy(lib, out, src, fonts, entry, qrBox, options);
  return out.save();
}
