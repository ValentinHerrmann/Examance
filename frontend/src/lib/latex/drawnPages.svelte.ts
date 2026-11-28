/** The pages the browser engine drew for one preview pane (issue #352): filled from the compile's `page` messages, shown by `DrawnPagesViewer`. */
import type { DrawnPage } from './compiler';

let stamps = 0;
/** Orders drawn pages and PDFs by arrival: a pane shows the newer of the two for each page. */
export function nextStamp(): number {
  return ++stamps;
}

export interface DrawnPageView {
  /** Null: the page could not be drawn exactly, the viewer shows it from the PDF. */
  bitmap: ImageBitmap | null;
  /** Page size in bp. */
  width: number;
  height: number;
  /** Device pixels per bp it was drawn at. */
  scale: number;
  stamp: number;
}

export class DrawnPages {
  /** By page index; a page without an entry shows from the PDF too. */
  pages = $state.raw<(DrawnPageView | undefined)[]>([]);
  /** Page count of the last compile that drew, or null. */
  count = $state<number | null>(null);
  /** Device pixels per bp the pane shows pages at; the next compile draws at it. */
  scale = 2;
  /** Pages since the last `begin`, so the latency of the first one can be logged. */
  private startedAt = 0;
  private first = true;

  /** A compile starts drawing. */
  begin(): void {
    this.startedAt = performance.now();
    this.first = true;
  }

  put(p: DrawnPage, scale: number): void {
    if (this.first) {
      // Duration only: from the compile request to the first drawn page.
      console.info(`[preview] drawn page ${p.page} after ${Math.round(performance.now() - this.startedAt)} ms`);
      this.first = false;
    }
    const next = [...this.pages];
    next[p.page - 1]?.bitmap?.close();
    next[p.page - 1] = { bitmap: p.bitmap, width: p.width, height: p.height, scale, stamp: nextStamp() };
    this.pages = next;
  }

  /** The compile has `count` pages: later ones are gone. */
  done(count: number): void {
    for (const gone of this.pages.slice(count)) gone?.bitmap?.close();
    this.pages = this.pages.slice(0, count);
    this.count = count;
  }

  clear(): void {
    this.done(0);
    this.count = null;
  }
}
