/** Personalised exam copies (issue #211): the compiled student sheet once per student, with their QR code in every sticker box, name and personal key on page 1's cut-off corner tab, and the cut line with scissors on every page. Same payload as a sticker, so scans, keys and result sharing work unchanged. With page codes (issue #220) every page's code also names the student. */

import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import { personalKey } from '#lib/crypto/stickerKey';
import { translate } from '#lib/i18n';
import { CM, drawQr, embedLabelFonts, fitText, type LabelFonts, type PdfLib } from '#lib/pdf/labelKit';
import { loadPdfjs } from '#lib/pdf/pdfjs';
import { formatCode } from '#lib/sharing/shareCrypto';
import { abbreviateGivenNames, parseStudentQr } from '#lib/utils/studentQr';
import { PAGE_CODE_EC, examTag, pageCodeText } from '#lib/exam/pageCodes';
import { MM, TAB_SIDE, TAB_TOP } from './cutCorner';
import type { StickerEntry } from './stickerSheet';

export interface ExamCopiesOptions {
  examTitle: string;
  /** The exam, for the tag in personalised page codes. */
  examId: string;
}

export interface ExamCopies {
  pdf: Uint8Array;
  /** Pages of each copy: every copy has the same count, so booklets and per-student files split the PDF by it. */
  pagesPerCopy: number;
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
/** Distance from the cut line to the paper corner. */
const ALTITUDE = (TAB_TOP * TAB_SIDE) / HYPOTENUSE;
/** Name and key rows parallel to the cut line: baseline distance from it, preferred and smallest font size. The name's descender (0.7 mm at 9 pt) stays CLEAR off the line; the key sits above the name's ascender. */
const NAME_ROW = { dist: CLEAR + 0.7 * MM, size: 9, minSize: 7 };
const KEY_ROW = { dist: CLEAR + 4.7 * MM, size: 8.5, minSize: 7 };
/** Scissors on the cut line, as vector paths (no font needed) around their centre, blades pointing along +x: handle rings and two crossing blades, about 3.5 mm long; the centre sits this far from the line's top end, 5 mm clear of the top edge (unprintable margin). */
const SCISSORS_RINGS = 'M -1.7 -2 a 1.5 1.5 0 1 0 -3 0 a 1.5 1.5 0 1 0 3 0 M -1.7 2 a 1.5 1.5 0 1 0 -3 0 a 1.5 1.5 0 1 0 3 0';
const SCISSORS_BLADES = 'M -2 -1.6 L 5.2 1.5 L -1.4 -0.6 Z M -2 1.6 L 5.2 -1.5 L -1.4 0.6 Z';
const SCISSORS_AT = 25 * MM;
const SCISSORS_GAP = 3 * MM;

/** Where a page gets stamped, in PDF points: its sticker boxes (`omr://__qr__`, page 1 and, with a box per sheet, every later sheet front) and its page code (`omr://__page__/<n>`, Schulaufgabe.sty section 11). */
interface StampTargets {
  qrBoxes: Rect[];
  pageCode: Rect | null;
}

async function findStampTargets(examPdf: Uint8Array): Promise<StampTargets[]> {
  const pdfjs = await loadPdfjs();
  // A copy: pdf.js detaches the buffer it is given, which would empty the caller's (cached) bytes.
  const task = pdfjs.getDocument({ data: examPdf.slice() });
  const doc = await task.promise;
  try {
    // Annotations only, no rendering: reading every page at once is cheap.
    return await Promise.all(
      Array.from({ length: doc.numPages }, async (_, k) => {
        const links = (await (await doc.getPage(k + 1)).getAnnotations()).filter((a) => a.subtype === 'Link');
        const url = (a: (typeof links)[number]): string => a.unsafeUrl ?? a.url ?? '';
        const code = links.find((a) => url(a).startsWith('omr://__page__/'));
        return { qrBoxes: links.filter((a) => url(a) === 'omr://__qr__').map((a) => a.rect as Rect), pageCode: code ? (code.rect as Rect) : null };
      }),
    );
  } finally {
    await task.destroy();
  }
}

/** Blanks *box* (keeping a thin rim) and draws *text*'s QR code centred in it, at most *max* wide. */
function stampQr(lib: PdfLib, page: PDFPage, box: Rect, text: string, max: number, pad: number, ecLevel: 'M' | 'Q' = 'M'): void {
  const [x0, y0, x1, y1] = box;
  const size = Math.min(max, x1 - x0 - 2 * pad, y1 - y0 - 2 * pad);
  page.drawRectangle({ x: x0 + pad, y: y0 + pad, width: x1 - x0 - 2 * pad, height: y1 - y0 - 2 * pad, color: lib.rgb(1, 1, 1) });
  drawQr(lib, page, text, (x0 + x1 - size) / 2, (y0 + y1 - size) / 2, size, ecLevel);
}

/** One row of the tab parallel to the cut line, centred where its glyphs stay EDGE clear of both paper edges. The first text that fits at a size down to the row's smallest (0.5 pt steps) wins; only the last one is shortened. */
function drawTabRow(lib: PdfLib, page: PDFPage, font: PDFFont, texts: readonly string[], row: { dist: number; size: number; minSize: number }): void {
  const { width, height } = page.getSize();
  const scale = 1 - row.dist / ALTITUDE;
  // Glyphs rise towards the corner: by `rise·cos` towards the top edge where the row starts, by `rise·sin` towards the right edge where it ends.
  const rise = (size: number) => font.heightAtSize(size, { descender: false });
  const start = (size: number) => (EDGE + rise(size) * COS) / SIN;
  const room = (size: number) => scale * HYPOTENUSE - start(size) - (EDGE + rise(size) * SIN) / COS;
  const sizeFor = (text: string): number | null => {
    for (let size = row.size; size >= row.minSize; size -= 0.5) if (font.widthOfTextAtSize(text, size) <= room(size)) return size;
    return null;
  };
  const fitting = texts.map((text) => ({ text, size: sizeFor(text) })).find((c) => c.size !== null);
  const size = fitting?.size ?? row.minSize;
  const line = fitText(font, fitting?.text ?? texts.at(-1) ?? '', size, room(size));
  const along = start(size) + (room(size) - font.widthOfTextAtSize(line, size)) / 2;
  page.drawText(line, { x: width - scale * TAB_TOP + COS * along, y: height - SIN * along, size, font, rotate: lib.degrees(-ANGLE) });
}

/** The dashed cut line in a top corner, interrupted by small scissors near its top end; the guillotine follows it through the whole stack. */
function drawCutLine(lib: PdfLib, page: PDFPage, side: 'left' | 'right'): void {
  const { width, height } = page.getSize();
  const right = side === 'right';
  // From the line's top end along it, mirrored on the left page.
  const point = (along: number) => ({ x: right ? width - TAB_TOP + COS * along : TAB_TOP - COS * along, y: height - SIN * along });
  const grey = lib.rgb(0.5, 0.5, 0.5);
  for (const [from, to] of [[0, SCISSORS_AT - SCISSORS_GAP], [SCISSORS_AT + SCISSORS_GAP, HYPOTENUSE]]) {
    page.drawLine({ start: point(from), end: point(to), thickness: 0.6, color: grey, dashArray: [4, 3] });
  }
  // Blades point along the line towards the side edge.
  const at = { ...point(SCISSORS_AT), rotate: lib.degrees(right ? -ANGLE : 180 + ANGLE) };
  page.drawSvgPath(SCISSORS_RINGS, { ...at, borderColor: grey, borderWidth: 0.7 });
  page.drawSvgPath(SCISSORS_BLADES, { ...at, color: grey });
}

/** The corner tab on page 1: blanked (the sheet tints it grey), the cut line, and name and key parallel to it in the corner at least 3 mm from the line and 4 mm from the edges. */
function drawCornerTab(lib: PdfLib, page: PDFPage, fonts: LabelFonts, entry: StickerEntry, key: string): void {
  const { height } = page.getSize();
  page.drawSvgPath(`M ${page.getWidth() - TAB_TOP} 0 L ${page.getWidth()} 0 L ${page.getWidth()} ${TAB_SIDE} Z`, { x: 0, y: height, color: lib.rgb(1, 1, 1) });
  drawCutLine(lib, page, 'right');
  const name = fonts.safe(entry.label);
  drawTabRow(lib, page, fonts.bold, [name, abbreviateGivenNames(name)], NAME_ROW);
  drawTabRow(lib, page, fonts.monoBold, [formatCode(key)], KEY_ROW);
}

/** What every copy of one sheet shares. */
interface CopyContext {
  lib: PdfLib;
  out: PDFDocument;
  fonts: LabelFonts;
  targets: StampTargets[];
  tag: string;
}

function addCopy({ lib, out, fonts, targets, tag }: CopyContext, pages: PDFPage[], entry: StickerEntry, key: string): void {
  for (const page of pages) out.addPage(page);
  const first = pages[0];
  // A student without a sticker ID keeps the plain page codes: only the cover names them (the Print step warns).
  const id = parseStudentQr(entry.payload)?.studentNumber;
  pages.forEach((page, i) => {
    // The box's sticker instructions stay for spare plain copies; on a personalised copy they would show through the code.
    for (const box of targets[i]?.qrBoxes ?? []) stampQr(lib, page, box, entry.payload, QR_SIZE, 0.1 * CM);
    const code = targets[i]?.pageCode;
    if (code && id) stampQr(lib, page, code, pageCodeText({ tag, page: i + 1, id }), code[2] - code[0], 0, PAGE_CODE_EC);
  });
  drawCornerTab(lib, first, fonts, entry, key);
  // Copies are printed long-edge duplex or as booklets and cut as one stack: each page shows its outer corner's line.
  for (let i = 1; i < pages.length; i++) drawCutLine(lib, pages[i], i % 2 === 1 ? 'left' : 'right');
  // With page codes the sheet already fills whole sheets (Schulaufgabe.sty); older sheets get a blank back so the next copy starts on a new sheet.
  if (!targets.some((t) => t.pageCode) && pages.length % 2 === 1) {
    const { width, height } = first.getSize();
    out.addPage([width, height]);
  }
}

/** One PDF with a copy of *examPdf* (the compiled student sheet) per entry, in list order. */
export async function renderExamCopies(examPdf: Uint8Array, entries: readonly StickerEntry[], options: ExamCopiesOptions): Promise<ExamCopies> {
  const targets = await findStampTargets(examPdf);
  if (!targets[0]?.qrBoxes.length) throw new Error(translate('sharing.stickers.noQrBox'));
  const tag = examTag(options.examId);
  const lib = await import('pdf-lib');
  const src = await lib.PDFDocument.load(examPdf);
  const out = await lib.PDFDocument.create();
  out.setTitle(options.examTitle || translate('sharing.stickers.copiesTitle'));
  const fonts = await embedLabelFonts(lib, out);
  // Copied and keyed up front, each copy with its own page objects; pages are then added in list order.
  const [copies, keys] = await Promise.all([
    Promise.all(entries.map(() => out.copyPages(src, src.getPageIndices()))),
    Promise.all(entries.map((entry) => personalKey(entry.payload))),
  ]);
  const ctx: CopyContext = { lib, out, fonts, targets, tag };
  entries.forEach((entry, i) => addCopy(ctx, copies[i], entry, keys[i]));
  const pagesPerCopy = entries.length ? out.getPageCount() / entries.length : src.getPageCount();
  return { pdf: await out.save(), pagesPerCopy };
}
