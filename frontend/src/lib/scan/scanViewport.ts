/** The scale every scanned page is rendered at (issue #265, docs/dev/multi_sheet_exams.md): a large-print copy is the A4 sheet enlarged to A3, so its scan is rendered smaller by that factor and detection, grading and graded PDFs see A4 geometry. The stored scan is never changed. */
import type { PDFPageProxy, PageViewport } from 'pdfjs-dist';

const A4_WIDTH_PT = 595.28;
const A3_PT = [841.89, 1190.55] as const;
/** How far a scanner's page may be off A3 (5 %). */
const A3_TOLERANCE = 0.05;

/** 1 for an ordinary page; for an upright A3 page the factor that brings it to A4 width. Only A3 counts: any other odd size (an image PDF at one point per pixel, B4) keeps the scale its stored ink and boxes were made at. A landscape sheet is a booklet spread and keeps its size. */
export function enlargedPageFactor(widthPt: number, heightPt: number): number {
  const near = (value: number, target: number) => Math.abs(value / target - 1) <= A3_TOLERANCE;
  return near(widthPt, A3_PT[0]) && near(heightPt, A3_PT[1]) ? A4_WIDTH_PT / widthPt : 1;
}

/** The viewport of a scanned page at *scale* pixels per A4 point. Every renderer of scans uses it, so pixel coordinates (ink, OMR boxes, score boxes) agree. */
export function scanViewport(page: PDFPageProxy, scale: number): PageViewport {
  const base = page.getViewport({ scale: 1 });
  return page.getViewport({ scale: scale * enlargedPageFactor(base.width, base.height) });
}
