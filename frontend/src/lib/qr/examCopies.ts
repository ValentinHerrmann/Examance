/** Personalised exam copies (issue #211): the compiled student sheet once per student, with their QR code in the sticker box and a cut-off strip with name and personal key in the band on top of page 1. Same payload as a sticker, so scans, keys and result sharing work unchanged. */

import type { PDFDocument, PDFPage } from 'pdf-lib';
import { personalKey } from '#lib/crypto/stickerKey';
import { translate } from '#lib/i18n';
import { CM, drawQr, embedLabelFonts, fitText, type LabelFonts, type PdfLib } from '#lib/pdf/labelKit';
import { loadPdfjs } from '#lib/pdf/pdfjs';
import { formatCode } from '#lib/sharing/shareCrypto';
import { CUT_LINE } from './cutStrip';
import type { StickerEntry } from './stickerSheet';

export interface ExamCopiesOptions {
  examTitle: string;
  /** Pads every copy to an even page count, so each student starts on a new sheet. */
  duplex: boolean;
}

type Rect = [number, number, number, number];

/** QR size like a sticker's; smaller only if the box is. */
const QR_SIZE = 2.6 * CM;
const SIDE = 1.5 * CM;

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

/** Name and key above a dashed cut line in the band on top of page 1; everything stays clear of the line by several millimetres. */
function drawStrip(lib: PdfLib, page: PDFPage, fonts: LabelFonts, entry: StickerEntry, key: string, examTitle: string): void {
  const { width, height } = page.getSize();
  const textWidth = width - 2 * SIDE;
  const name = fitText(fonts.bold, fonts.safe(entry.label), 12, textWidth * 0.6);
  page.drawText(name, { x: SIDE, y: height - 0.9 * CM, size: 12, font: fonts.bold });
  if (examTitle) {
    const title = fitText(fonts.regular, fonts.safe(examTitle), 8, textWidth * 0.38);
    page.drawText(title, { x: width - SIDE - fonts.regular.widthOfTextAtSize(title, 8), y: height - 0.9 * CM, size: 8, font: fonts.regular });
  }
  const label = `${fonts.safe(translate('sharing.stickers.keyTitle'))}: `;
  const keyY = height - 1.35 * CM;
  page.drawText(label, { x: SIDE, y: keyY, size: 8, font: fonts.regular });
  page.drawText(formatCode(key), { x: SIDE + fonts.regular.widthOfTextAtSize(label, 8), y: keyY, size: 11, font: fonts.monoBold });
  const hint = fitText(fonts.regular, fonts.safe(translate('sharing.stickers.stripHint')), 6.5, textWidth * 0.5);
  page.drawText(hint, { x: width - SIDE - fonts.regular.widthOfTextAtSize(hint, 6.5), y: keyY, size: 6.5, font: fonts.regular });
  const cutY = height - CUT_LINE;
  page.drawLine({ start: { x: 0, y: cutY }, end: { x: width, y: cutY }, thickness: 0.6, color: lib.rgb(0.5, 0.5, 0.5), dashArray: [4, 3] });
}

async function addCopy(lib: PdfLib, out: PDFDocument, src: PDFDocument, fonts: LabelFonts, entry: StickerEntry, qrBox: Rect, options: ExamCopiesOptions): Promise<void> {
  const pages = await out.copyPages(src, src.getPageIndices());
  for (const page of pages) out.addPage(page);
  const first = pages[0];
  const [x0, y0, x1, y1] = qrBox;
  const size = Math.min(QR_SIZE, x1 - x0 - 0.3 * CM, y1 - y0 - 0.3 * CM);
  drawQr(lib, first, entry.payload, (x0 + x1 - size) / 2, (y0 + y1 - size) / 2, size);
  drawStrip(lib, first, fonts, entry, await personalKey(entry.payload), options.examTitle);
  if (options.duplex && pages.length % 2 === 1) {
    const { width, height } = pages[pages.length - 1].getSize();
    out.addPage([width, height]);
  }
}

/** One PDF with a copy of *examPdf* (the student sheet, compiled with the exam's `cutStrip` band) per entry, in list order. */
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
