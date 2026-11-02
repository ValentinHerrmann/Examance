/** Printable slips that hand students their result links (issue #207): one slip per student with the QR code of the link, the link in text and what they need to open it. Codes made at sharing time go on separate slips, so they can be handed out apart from the links. */

import type { PDFPage } from 'pdf-lib';
import { translate } from '#lib/i18n';
import type { TranslationKey } from '#lib/i18n/types';
import {
  A4,
  CM,
  cutFrame,
  drawKeySlip,
  drawQr,
  embedLabelFonts,
  fitText,
  KEY_SLIP_GRID,
  placeOnPages,
  wrapText,
  type Box,
  type LabelFonts,
  type PdfLib,
} from '#lib/pdf/labelKit';
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

const LINK_GRID = { cols: 2, rows: 4 };
const QR_SIZE = 3.6 * CM;

const HINT: Record<ShareFactor, TranslationKey> = {
  none: 'sharing.slips.hintNone',
  sticker: 'sharing.slips.hintSticker',
  code: 'sharing.slips.hintCode',
};

function drawLinkSlip(lib: PdfLib, page: PDFPage, fonts: LabelFonts, input: SlipsInput, entry: SlipEntry, box: Box): void {
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

export async function renderShareSlips(input: SlipsInput): Promise<Uint8Array> {
  const lib = await import('pdf-lib');
  const pdf = await lib.PDFDocument.create();
  pdf.setTitle(translate('sharing.slips.pdfTitle', { exam: input.examTitle }));
  const fonts = await embedLabelFonts(lib, pdf);
  placeOnPages(lib, pdf, LINK_GRID, input.entries.length, (page, box, i) => drawLinkSlip(lib, page, fonts, input, input.entries[i], box));
  if (input.factor === 'code') {
    const codeTitle = translate('sharing.slips.codeTitle');
    placeOnPages(lib, pdf, KEY_SLIP_GRID, input.entries.length, (page, box, i) =>
      drawKeySlip(lib, page, fonts, { name: input.entries[i].name, subtitle: input.examTitle, title: codeTitle, code: input.entries[i].code ?? '' }, box, formatCode)
    );
  }
  if (pdf.getPageCount() === 0) pdf.addPage([A4.width, A4.height]);
  return pdf.save();
}
