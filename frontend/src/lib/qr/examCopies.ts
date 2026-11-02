/** Personalised exam copies (issue #211): the compiled student sheet once per student, with their QR code in the sticker box and a cut-off corner tab with name and personal key at page 1's top-right corner. Same payload as a sticker, so scans, keys and result sharing work unchanged. */

import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import { personalKey } from '#lib/crypto/stickerKey';
import { translate } from '#lib/i18n';
import { CM, drawQr, embedLabelFonts, fitText, type LabelFonts, type PdfLib } from '#lib/pdf/labelKit';
import { loadPdfjs } from '#lib/pdf/pdfjs';
import { formatCode } from '#lib/sharing/shareCrypto';
import { TAB_SIDE, TAB_TOP } from './cutCorner';
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
/** Distance from the cut line to the paper corner. */
const ALTITUDE = (TAB_TOP * TAB_SIDE) / HYPOTENUSE;
const ANGLE = (Math.atan2(TAB_SIDE, TAB_TOP) * 180) / Math.PI;
const SIN = TAB_SIDE / HYPOTENUSE;
const COS = TAB_TOP / HYPOTENUSE;
/** Clear of the printer's unprintable margin. */
const EDGE = 0.4 * CM;

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

/** One line of tab text parallel to the cut line, *dist* inside it, centred where its glyphs stay EDGE clear of both paper edges; a long name shrinks down to *minSize* before it is shortened. */
function drawTabLine(lib: PdfLib, page: PDFPage, font: PDFFont, text: string, size: number, dist: number, minSize = size): void {
  const { width, height } = page.getSize();
  const scale = 1 - dist / ALTITUDE;
  const room = (s: number) => {
    // Glyphs rise towards the corner: by `rise·cos` towards the top edge at the start, by `rise·sin` towards the right edge at the end.
    const rise = s * 0.75;
    return scale * HYPOTENUSE - (EDGE + rise * COS) / SIN - (EDGE + rise * SIN) / COS;
  };
  let fontSize = size;
  while (fontSize > minSize && font.widthOfTextAtSize(text, fontSize) > room(fontSize)) fontSize -= 0.5;
  const line = fitText(font, text, fontSize, room(fontSize));
  const along = (EDGE + fontSize * 0.75 * COS) / SIN + (room(fontSize) - font.widthOfTextAtSize(line, fontSize)) / 2;
  page.drawText(line, {
    x: width - scale * TAB_TOP + COS * along,
    y: height - SIN * along,
    size: fontSize,
    font,
    rotate: lib.degrees(-ANGLE),
  });
}

/** The corner tab on page 1: a dashed diagonal, and name, key and a hint on the corner side of it, all at least 4 mm from the line. */
function drawCornerTab(lib: PdfLib, page: PDFPage, fonts: LabelFonts, entry: StickerEntry, key: string): void {
  const { width, height } = page.getSize();
  page.drawLine({
    start: { x: width - TAB_TOP, y: height },
    end: { x: width, y: height - TAB_SIDE },
    thickness: 0.6,
    color: lib.rgb(0.5, 0.5, 0.5),
    dashArray: [4, 3],
  });
  drawTabLine(lib, page, fonts.regular, fonts.safe(translate('sharing.stickers.cornerHint')), 5.5, 0.42 * CM);
  drawTabLine(lib, page, fonts.bold, fonts.safe(entry.label), 9, 0.85 * CM, 7);
  drawTabLine(lib, page, fonts.monoBold, formatCode(key), 9, 1.35 * CM);
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
