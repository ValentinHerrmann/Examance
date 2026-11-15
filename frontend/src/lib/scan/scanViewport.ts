/** The scale every scanned page is rendered at (issue #265, docs/dev/multi_sheet_exams.md): a large-print copy is the A4 sheet enlarged to A3, so its scan is rendered smaller by that factor and detection, grading and graded PDFs see A4 geometry. The stored scan is never changed. */
import type { PDFPageProxy, PageViewport } from 'pdfjs-dist';

const A4_WIDTH_PT = 595.28;

/** 1 for an ordinary page; for an upright page of A-series shape clearly wider than A4 (A3 and up) the factor that brings it to A4 width. A landscape sheet is a booklet spread and keeps its size. */
export function enlargedPageFactor(widthPt: number, heightPt: number): number {
  const upright = heightPt > widthPt && Math.abs(heightPt / widthPt - Math.SQRT2) < 0.08;
  return upright && widthPt > A4_WIDTH_PT * 1.2 ? A4_WIDTH_PT / widthPt : 1;
}

/** The viewport of a scanned page at *scale* pixels per A4 point. Every renderer of scans uses it, so pixel coordinates (ink, OMR boxes, score boxes) agree. */
export function scanViewport(page: PDFPageProxy, scale: number): PageViewport {
  const base = page.getViewport({ scale: 1 });
  return page.getViewport({ scale: scale * enlargedPageFactor(base.width, base.height) });
}
