/** Lazy rendering of a scanned PDF's pages in the grading viewer: a page renders when it scrolls near the pane. Split out of ScanCanvasViewer.svelte; the component owns the canvases. */

import { scanViewport } from '#lib/scan/scanViewport';

/** pdf.js render scale of scan pages; stroke coordinates are stored in these canvas pixels, so it never changes. */
export const PDF_RENDER_SCALE = 2;

export interface ScanPageView {
  canvas(page: number): HTMLCanvasElement | undefined;
  pageEls(): (HTMLElement | undefined)[];
  viewport(): HTMLElement | undefined;
  /** A page finished rendering for the current document. */
  onRendered(page: number): void;
}

export class ScanPageRenderer {
  /** The pdf.js document (loaded lazily and untyped, `lib/pdf/pdfjs.ts`). */
  private current: any = null;
  private rendered = new Set<number>();
  private observer: IntersectionObserver | null = null;

  constructor(private readonly view: ScanPageView) {}

  /** Replaces the document (null = none) and destroys the previous one. */
  setDocument(doc: any) {
    if (this.current && this.current !== doc) void this.current.loadingTask?.destroy();
    this.current = doc;
  }

  /** Forgets the rendered pages and stops observing (a new page stack). */
  reset() {
    this.observer?.disconnect();
    this.rendered = new Set();
  }

  /** Renders pages near the viewport (one screen ahead and behind) on first approach. */
  observe() {
    this.observer?.disconnect();
    const root = this.view.viewport();
    const els = this.view.pageEls();
    if (!root || typeof IntersectionObserver === 'undefined') {
      els.forEach((_, i) => void this.render(i + 1));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (page) void this.render(page);
        }
      },
      { root, rootMargin: '100% 0px' },
    );
    this.observer = observer;
    for (const el of els) {
      if (el) observer.observe(el);
    }
  }

  private async render(page: number) {
    const doc = this.current;
    const canvas = this.view.canvas(page);
    if (!doc || !canvas || this.rendered.has(page)) return;
    this.rendered.add(page);
    try {
      const pdfPage = await doc.getPage(page);
      if (doc !== this.current) return;
      const viewport = scanViewport(pdfPage, PDF_RENDER_SCALE);
      await pdfPage.render({ canvasContext: canvas.getContext('2d')!, canvas, viewport }).promise;
      if (doc === this.current) this.view.onRendered(page);
    } catch (err) {
      if (doc === this.current) {
        this.rendered.delete(page);
        console.error(`Failed to render scan page ${page}:`, err);
      }
    }
  }

  /** Stops observing and destroys the document (the viewer unmounts). */
  destroy() {
    this.observer?.disconnect();
    this.setDocument(null);
  }
}
