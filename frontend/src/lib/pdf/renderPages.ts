/** Every page of a PDF as an image plus its link rects (issue #272: the Layout step's sample). */

import { loadPdfjs } from '#lib/pdf/pdfjs';

const MM_PER_PT = 25.4 / 72;

export interface RenderedPage {
  widthMm: number;
  heightMm: number;
  /** PNG data URL (img-src allows data:). */
  url: string;
  /** Link annotations, top-left origin, in millimetres. */
  links: { uri: string; x: number; y: number; w: number; h: number }[];
}

/** Renders each page at *pxPerMm* (times the device pixel ratio); the bytes stay usable, pdf.js gets a copy. */
export async function renderPdfPages(bytes: Uint8Array, pxPerMm = 4): Promise<RenderedPage[]> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: bytes.slice() });
  try {
    const doc = await task.promise;
    const pages: RenderedPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = (pxPerMm * MM_PER_PT) * (globalThis.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d')!, canvas, viewport } as any).promise;
      const annotations: any[] = await page.getAnnotations();
      const links = annotations
        .filter((a) => a.subtype === 'Link' && (a.unsafeUrl ?? a.url))
        .map((a) => {
          const [x0, y0, x1, y1] = a.rect as number[];
          return { uri: String(a.unsafeUrl ?? a.url), x: x0! * MM_PER_PT, y: (base.height - y1!) * MM_PER_PT, w: (x1! - x0!) * MM_PER_PT, h: (y1! - y0!) * MM_PER_PT };
        });
      pages.push({ widthMm: base.width * MM_PER_PT, heightMm: base.height * MM_PER_PT, url: canvas.toDataURL('image/png'), links });
    }
    return pages;
  } finally {
    void task.destroy();
  }
}
