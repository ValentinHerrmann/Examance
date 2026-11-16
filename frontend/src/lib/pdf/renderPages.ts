/** PDF pages as images plus their link rects (issue #272: the Layout step's sample): small thumbnails of every page, and one page at the width it is shown at. */

import { loadPdfjs } from '#lib/pdf/pdfjs';

const MM_PER_PT = 25.4 / 72;
/** Largest bitmap width of one page, to bound memory on large screens. */
const MAX_WIDTH_PX = 2400;

export interface RenderedPage {
  widthMm: number;
  heightMm: number;
  /** PNG data URL (img-src allows data:). */
  url: string;
  /** Link annotations, top-left origin, in millimetres. */
  links: { uri: string; x: number; y: number; w: number; h: number }[];
}

/** Runs *work* on the opened document; pdf.js gets a copy, so the bytes stay usable. */
async function withDocument<T>(bytes: Uint8Array, work: (doc: any) => Promise<T>): Promise<T> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: bytes.slice() });
  try {
    return await work(await task.promise);
  } finally {
    void task.destroy();
  }
}

async function pageToUrl(page: any, scale: number): Promise<string> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d')!, canvas, viewport } as any).promise;
  return canvas.toDataURL('image/png');
}

/** Every page as a thumbnail at *pxPerMm* (times the device pixel ratio), with its size and links. */
export function renderPdfPages(bytes: Uint8Array, pxPerMm = 1.5): Promise<RenderedPage[]> {
  const scale = pxPerMm * MM_PER_PT * (globalThis.devicePixelRatio || 1);
  return withDocument(bytes, (doc) => Promise.all(Array.from({ length: doc.numPages }, (_, i) => thumbnailOf(doc, i + 1, scale))));
}

/** One page's size, links and thumbnail. */
async function thumbnailOf(doc: any, n: number, scale: number): Promise<RenderedPage> {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const [annotations, url] = await Promise.all([page.getAnnotations() as Promise<any[]>, pageToUrl(page, scale)]);
  const links = annotations
    .filter((a) => a.subtype === 'Link' && (a.unsafeUrl ?? a.url))
    .map((a) => {
      const [x0, y0, x1, y1] = a.rect as number[];
      return { uri: String(a.unsafeUrl ?? a.url), x: x0! * MM_PER_PT, y: (base.height - y1!) * MM_PER_PT, w: (x1! - x0!) * MM_PER_PT, h: (y1! - y0!) * MM_PER_PT };
    });
  return { widthMm: base.width * MM_PER_PT, heightMm: base.height * MM_PER_PT, url, links };
}

/** Page *n* (1-based) rendered *widthPx* device pixels wide, so it stays sharp where it is shown. */
export function renderPdfPage(bytes: Uint8Array, n: number, widthPx: number): Promise<string> {
  return withDocument(bytes, async (doc) => {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    return pageToUrl(page, Math.min(widthPx, MAX_WIDTH_PX) / base.width);
  });
}
