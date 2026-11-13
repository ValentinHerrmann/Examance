/** Prints the grading review (objections and replies, issue #226) into graded PDFs: short note under the score box, outer strip, summary page, and always the full thread as `review.txt`. */

import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import type { GradingReviewItem } from '#lib/db/schema';
import { findScoreBox, SCORE_BOX_SCAN_SCALE, type ScoreBoxContext } from '#lib/grading/scoreBoxes';
import { pdfRectToNormalized, type Homography } from '#lib/grading/omrRegistration';
import { formatPoints } from '#lib/grading/omrOverlay';
import { translate } from '#lib/i18n';
import { fitText, wrapText, type PdfLib } from '#lib/pdf/labelKit';
import { makeSafeText } from './summaryPdf';

export type ReviewPrintMode = 'none' | 'short' | 'strip' | 'page';
export const REVIEW_PRINT_MODES: readonly ReviewPrintMode[] = ['short', 'strip', 'page', 'none'];
export const DEFAULT_REVIEW_PRINT_MODE: ReviewPrintMode = 'short';

export interface ReviewPrint {
  items: GradingReviewItem[];
  mode: ReviewPrintMode;
}

/** What the PDF re-sealed for the student carries (share flow): the short note per item. */
export const shareReviewPrint = (items: GradingReviewItem[]): ReviewPrint => ({ items, mode: 'short' });

export const REVIEW_ATTACHMENT_NAME = 'review.txt';
/** Width of the added margin strip (55 mm). */
export const STRIP_WIDTH_PT = (55 * 72) / 25.4;

const INK: [number, number, number] = [0.8, 0.1, 0.1];
const STRIP_PAD = 4;
const A4: [number, number] = [595.28, 841.89];

/** Only items the student objected to are printed. */
export const printableItems = (items: readonly GradingReviewItem[]): GradingReviewItem[] => items.filter((i) => i.objection.trim() !== '');

export interface ReviewLabels {
  review: string;
  points: string;
  objection: string;
  reply: string;
  truncated: string;
  title: string;
}

/** PDF output follows the interface language here, as the teacher prints for their own use. */
export function reviewLabels(): ReviewLabels {
  return {
    review: translate('export.review.pdf.review'),
    points: translate('export.review.pdf.points'),
    objection: translate('export.review.pdf.objection'),
    reply: translate('export.review.pdf.reply'),
    truncated: translate('export.review.pdf.truncated'),
    title: translate('export.review.pdf.title'),
  };
}

/** "3 -> 4 P." ("->" because the arrow is not in WinAnsi); empty when no points are known. */
export function pointsText(item: GradingReviewItem, labels: ReviewLabels): string {
  const { pointsBefore: b, pointsAfter: a } = item;
  if (b != null && a != null) return `${formatPoints(b)} -> ${formatPoints(a)} ${labels.points}`;
  const one = a ?? b;
  return one == null ? '' : `${formatPoints(one)} ${labels.points}`;
}

export function shortText(item: GradingReviewItem, labels: ReviewLabels): string {
  const pts = pointsText(item, labels);
  return pts ? `${labels.review}: ${pts}` : labels.review;
}

/** The full thread as plain text, attached whatever got cut short on paper. */
export function reviewAttachmentText(items: readonly GradingReviewItem[], labels: ReviewLabels): string {
  const blocks = items.map((item) => {
    const pts = pointsText(item, labels);
    return [`${item.label}${pts ? ` (${pts})` : ''}`, `${labels.objection}: ${item.objection.trim()}`, ...(item.reply.trim() ? [`${labels.reply}: ${item.reply.trim()}`] : [])].join('\n');
  });
  return `${labels.title}\n\n${blocks.join('\n\n')}\n`;
}

type Measure = Pick<PDFFont, 'widthOfTextAtSize'>;

export interface PlacedBlock {
  lines: string[];
  /** Top edge of the first line (PDF y, up). */
  top: number;
}

export interface BlockLayout {
  size: number;
  blocks: PlacedBlock[];
  fits: boolean;
}

function itemLines(font: Measure, item: GradingReviewItem, labels: ReviewLabels, size: number, width: number): string[] {
  const pts = pointsText(item, labels);
  const wrap = (text: string) => wrapText(font as PDFFont, text, size, width);
  return [...wrap(`${item.label}${pts ? `: ${pts}` : ''}`), ...wrap(`${labels.objection}: ${item.objection}`), ...(item.reply.trim() ? wrap(`${labels.reply}: ${item.reply}`) : [])];
}

/** Cuts *lines* to *cap* lines, the last one ending in the "full text attached" marker. */
function truncateLines(font: Measure, lines: string[], cap: number, labels: ReviewLabels, size: number, width: number): string[] {
  if (lines.length <= cap) return lines;
  const kept = lines.slice(0, cap);
  let last = kept[cap - 1];
  while (last && font.widthOfTextAtSize(`${last} ${labels.truncated}`, size) > width) last = last.slice(0, -1);
  kept[cap - 1] = `${last.trimEnd()} ${labels.truncated}`.trim();
  return kept;
}

/** Stacks the items top down (each at its wanted top where free, else below the previous), shrinking the font through *sizes* and finally truncating; `tops[i]` null = right below the previous. */
export function layoutBlocks(
  font: Measure,
  items: readonly GradingReviewItem[],
  labels: ReviewLabels,
  o: { width: number; pageTop: number; bottom: number; sizes: number[]; tops: (number | null)[] }
): BlockLayout {
  const order = items.map((_, i) => i).sort((a, b) => (o.tops[b] ?? -Infinity) - (o.tops[a] ?? -Infinity) || a - b);
  const stack = (size: number, cap: number): BlockLayout => {
    const lineH = size * 1.2;
    let cursor = o.pageTop;
    const blocks: PlacedBlock[] = [];
    for (const i of order) {
      const all = itemLines(font, items[i], labels, size, o.width);
      const lines = cap < 0 ? all : truncateLines(font, all, cap, labels, size, o.width);
      const top = Math.min(o.tops[i] ?? cursor, cursor);
      blocks.push({ lines, top });
      cursor = top - lines.length * lineH - size * 0.8;
    }
    return { size, blocks, fits: blocks.every((b) => b.top - b.lines.length * lineH >= o.bottom) };
  };
  for (const size of o.sizes) {
    const layout = stack(size, -1);
    if (layout.fits) return layout;
  }
  const size = o.sizes[o.sizes.length - 1];
  const longest = Math.max(1, ...items.map((item) => itemLines(font, item, labels, size, o.width).length));
  let last = stack(size, 1);
  for (let cap = longest - 1; cap >= 1; cap--) {
    const layout = stack(size, cap);
    if (layout.fits) {
      last = layout;
      break;
    }
  }
  return last;
}

function drawBlocks(lib: PdfLib, page: PDFPage, font: PDFFont, layout: BlockLayout, x: number, bottom: number): void {
  const lineH = layout.size * 1.2;
  for (const block of layout.blocks) {
    block.lines.forEach((text, i) => {
      const y = block.top - layout.size - i * lineH;
      if (y < bottom) return;
      page.drawText(text, { x, y, size: layout.size, font, color: lib.rgb(...INK) });
    });
  }
}

export interface PlacedItem {
  item: GradingReviewItem;
  /** Score box on the output page in PDF points (y up). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Where each printable item's score box lies on scan page *page* (1-based); items without a box are left out (the attachment still has them). */
export function placeReviewItems(
  boxes: ScoreBoxContext,
  page: number,
  items: readonly GradingReviewItem[],
  H: Homography | null,
  raster: { w: number; h: number },
  pageSize: { w: number; h: number }
): PlacedItem[] {
  const template = boxes.pages[page - 1];
  if (!template) return [];
  const placed: PlacedItem[] = [];
  for (const item of items) {
    const found = findScoreBox(boxes, item.key);
    if (found?.page !== page) continue;
    if (H) {
      const [nx0, ny0, nx1, ny1] = pdfRectToNormalized(H, found.box.rect, SCORE_BOX_SCAN_SCALE, template.pageHeightPt, raster.w, raster.h);
      placed.push({ item, x0: nx0 * pageSize.w, x1: nx1 * pageSize.w, y1: pageSize.h - ny0 * pageSize.h, y0: pageSize.h - ny1 * pageSize.h });
    } else {
      const [x0, y0, x1, y1] = found.box.rect;
      const sx = pageSize.w / template.pageWidthPt;
      const sy = pageSize.h / template.pageHeightPt;
      placed.push({ item, x0: x0 * sx, x1: x1 * sx, y0: y0 * sy, y1: y1 * sy });
    }
  }
  return placed;
}

const SHORT_SIZE = 7;

/** "Einsicht: 3 -> 4 P." right under each score box; vector text, the scan stays uncovered. */
export function drawShortNotes(lib: PdfLib, page: PDFPage, font: PDFFont, placed: readonly PlacedItem[], labels: ReviewLabels, offsetX = 0): void {
  const safe = makeSafeText(font);
  const pageW = page.getSize().width;
  for (const p of placed) {
    const x = p.x0 + offsetX;
    const text = fitText(font, safe(shortText(p.item, labels)), SHORT_SIZE, Math.max(pageW - x - 4, 20));
    page.drawText(text, { x, y: p.y0 - SHORT_SIZE - 1, size: SHORT_SIZE, font, color: lib.rgb(...INK) });
  }
}

/** Fills the 55 mm strip on the outer side (`x0` = its left edge) with the items level with their score boxes. */
export function drawStrip(lib: PdfLib, page: PDFPage, font: PDFFont, placed: readonly PlacedItem[], labels: ReviewLabels, x0: number): void {
  const { height } = page.getSize();
  const safe = makeSafeText(font);
  const margin = 24;
  const items = placed.map((p) => ({ ...p.item, objection: safe(p.item.objection), reply: safe(p.item.reply), label: safe(p.item.label) }));
  const safeLabels = Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, safe(v)])) as unknown as ReviewLabels;
  const layout = layoutBlocks(font, items, safeLabels, {
    width: STRIP_WIDTH_PT - 2 * STRIP_PAD,
    pageTop: height - margin,
    bottom: margin,
    sizes: [8, 7, 6.5, 6],
    tops: placed.map((p) => p.y1),
  });
  drawBlocks(lib, page, font, layout, x0 + STRIP_PAD, margin);
}

/** Appends one A4 page listing every item; long threads shrink, then are cut with a pointer to the attachment. */
export function appendSummaryPage(lib: PdfLib, doc: PDFDocument, font: PDFFont, items: readonly GradingReviewItem[], labels: ReviewLabels): void {
  const safe = makeSafeText(font);
  const page = doc.addPage(A4);
  const margin = 40;
  const title = safe(labels.title);
  page.drawText(title, { x: margin, y: A4[1] - margin - 12, size: 12, font, color: lib.rgb(...INK) });
  const clean = items.map((item) => ({ ...item, objection: safe(item.objection), reply: safe(item.reply), label: safe(item.label) }));
  const safeLabels = Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, safe(v)])) as unknown as ReviewLabels;
  const layout = layoutBlocks(font, clean, safeLabels, {
    width: A4[0] - 2 * margin,
    pageTop: A4[1] - margin - 30,
    bottom: margin,
    sizes: [10, 9, 8, 7, 6],
    tops: clean.map(() => null),
  });
  drawBlocks(lib, page, font, layout, margin, margin);
}

/** The parts of the review that follow the scan pages: the summary page (mode `page`) and the full-thread attachment. */
export async function finishReview(lib: PdfLib, doc: PDFDocument, font: PDFFont, items: readonly GradingReviewItem[], mode: ReviewPrintMode): Promise<void> {
  const labels = reviewLabels();
  if (mode === 'page') appendSummaryPage(lib, doc, font, items, labels);
  await doc.attach(new TextEncoder().encode(reviewAttachmentText(items, labels)), REVIEW_ATTACHMENT_NAME, { mimeType: 'text/plain' });
}
