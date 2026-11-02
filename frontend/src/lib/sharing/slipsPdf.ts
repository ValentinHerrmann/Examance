/** Printable slips that hand students their result links (issue #207): one slip per student with the QR code of the link, the link in text and what they need to open it. Codes made at sharing time go on separate slips, so they can be handed out apart from the links. */

import type { PDFFont, PDFPage } from 'pdf-lib';
import { makeSafeText } from '#lib/export/summaryPdf';
import { translate } from '#lib/i18n';
import type { TranslationKey } from '#lib/i18n/types';
import { A4, CM, cutFrame, drawQr, fitText, wrapText, type PdfLib } from '#lib/pdf/labelKit';
import { formatDate } from '#lib/utils/format';
import { formatCode, type ShareFactor } from './shareCrypto';

export interface SlipEntry {
  name: string;
  url: string;
  /** The code made at sharing time (`code` factor); printed only on its own slip. */
  code?: string;
}

export interface SlipsInput {
  examTitle: string;
  expiresAt: Date;
  factor: ShareFactor;
  entries: readonly SlipEntry[];
}

const MARGIN = 1 * CM;
const LINK_GRID = { cols: 2, rows: 4 };
const CODE_GRID = { cols: 3, rows: 8 };
const QR_SIZE = 3.6 * CM;

const HINT: Record<ShareFactor, TranslationKey> = {
  none: 'sharing.slips.hintNone',
  sticker: 'sharing.slips.hintSticker',
  code: 'sharing.slips.hintCode',
};

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
  safe: (text: string) => string;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function grid(cols: number, rows: number): (slot: number) => Box {
  const w = (A4.width - 2 * MARGIN) / cols;
  const h = (A4.height - 2 * MARGIN) / rows;
  return (slot) => ({ x: MARGIN + (slot % cols) * w, y: A4.height - MARGIN - (Math.floor(slot / cols) + 1) * h, w, h });
}

function drawLinkSlip(lib: PdfLib, page: PDFPage, fonts: Fonts, input: SlipsInput, entry: SlipEntry, box: Box): void {
  cutFrame(lib, page, box.x, box.y, box.w, box.h);
  const pad = 10;
  const top = box.y + box.h - pad;
  const textWidth = box.w - 2 * pad;
  page.drawText(fitText(fonts.bold, fonts.safe(input.examTitle), 10, textWidth), { x: box.x + pad, y: top - 10, size: 10, font: fonts.bold });
  page.drawText(fitText(fonts.regular, fonts.safe(entry.name), 9, textWidth), { x: box.x + pad, y: top - 23, size: 9, font: fonts.regular });

  const qrY = top - 30 - QR_SIZE;
  drawQr(lib, page, entry.url, box.x + pad - 4, qrY, QR_SIZE);
  const sideX = box.x + pad + QR_SIZE + 2;
  const sideWidth = box.x + box.w - pad - sideX;
  const lines = [
    ...wrapText(fonts.regular, fonts.safe(translate('sharing.slips.scan')), 7.5, sideWidth),
    '',
    ...wrapText(fonts.regular, fonts.safe(translate(HINT[input.factor])), 7.5, sideWidth),
    '',
    ...wrapText(fonts.bold, fonts.safe(translate('sharing.slips.validUntil', { date: formatDate(input.expiresAt) })), 7.5, sideWidth),
  ];
  lines.forEach((line, i) => {
    if (line) page.drawText(line, { x: sideX, y: top - 38 - i * 9.5, size: 7.5, font: i === lines.length - 1 ? fonts.bold : fonts.regular });
  });

  const url = wrapText(fonts.mono, entry.url, 5.5, textWidth);
  url.forEach((line, i) => page.drawText(line, { x: box.x + pad, y: box.y + pad + (url.length - 1 - i) * 7, size: 5.5, font: fonts.mono }));
}

function drawCodeSlip(lib: PdfLib, page: PDFPage, fonts: Fonts, input: SlipsInput, entry: SlipEntry, box: Box): void {
  cutFrame(lib, page, box.x, box.y, box.w, box.h);
  const pad = 8;
  const width = box.w - 2 * pad;
  const top = box.y + box.h - pad;
  page.drawText(fitText(fonts.bold, fonts.safe(entry.name), 8, width), { x: box.x + pad, y: top - 8, size: 8, font: fonts.bold });
  page.drawText(fitText(fonts.regular, fonts.safe(input.examTitle), 6.5, width), { x: box.x + pad, y: top - 18, size: 6.5, font: fonts.regular });
  page.drawText(fitText(fonts.regular, fonts.safe(translate('sharing.slips.codeTitle')), 6.5, width), { x: box.x + pad, y: top - 32, size: 6.5, font: fonts.regular });
  const code = formatCode(entry.code ?? '');
  page.drawText(code, { x: box.x + (box.w - fonts.mono.widthOfTextAtSize(code, 13)) / 2, y: box.y + pad + 4, size: 13, font: fonts.mono });
}

export async function renderShareSlips(input: SlipsInput): Promise<Uint8Array> {
  const lib = await import('pdf-lib');
  const pdf = await lib.PDFDocument.create();
  pdf.setTitle(translate('sharing.slips.pdfTitle', { exam: input.examTitle }));
  const regular = await pdf.embedFont(lib.StandardFonts.Helvetica);
  const fonts: Fonts = {
    regular,
    bold: await pdf.embedFont(lib.StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(lib.StandardFonts.Courier),
    safe: makeSafeText(regular),
  };

  const sheets = (kind: 'link' | 'code') => {
    const { cols, rows } = kind === 'link' ? LINK_GRID : CODE_GRID;
    const place = grid(cols, rows);
    let page: PDFPage | null = null;
    input.entries.forEach((entry, i) => {
      const slot = i % (cols * rows);
      if (!page || slot === 0) page = pdf.addPage([A4.width, A4.height]);
      if (kind === 'link') drawLinkSlip(lib, page, fonts, input, entry, place(slot));
      else drawCodeSlip(lib, page, fonts, input, entry, place(slot));
    });
  };
  sheets('link');
  if (input.factor === 'code') sheets('code');
  if (pdf.getPageCount() === 0) pdf.addPage([A4.width, A4.height]);
  return pdf.save();
}
