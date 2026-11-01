/** Zoom and two-finger navigation of the grading viewer's page stack (split out of ScanCanvasViewer.svelte): ctrl+wheel, buttons, fit-to-page, pinch, and keeping the current spot in view across a zoom. The zoom level lives in `gradingStore`. */

import { tick } from "svelte";
import { get } from "svelte/store";
import { gradingStore } from "#lib/grading/gradingStore";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4.0;
const STEP = 0.25;

type Point = { x: number; y: number };

export interface ZoomView {
  viewport: () => HTMLDivElement | undefined;
  /** Canvas size of a page (1-based), if known. */
  pageSize: (page: number) => { w: number; h: number } | undefined;
  pageEl: (page: number) => HTMLDivElement | undefined;
  /** Scroll offset of a page's top inside the viewport. */
  pageTop: (page: number) => number | null;
  padding: number;
}

const clampZoom = (z: number, min = MIN_ZOOM) => Math.min(MAX_ZOOM, Math.max(min, Math.round(z * 100) / 100));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export class ScanZoom {
  private pinchDistance: number | null = null;
  private pinchStartZoom = 1;
  private lastMid: Point | null = null;
  private lastZoom: number | null = null;

  constructor(private readonly view: ZoomView) {}

  zoomIn() {
    gradingStore.setZoomScale(clampZoom(get(gradingStore).zoomScale + STEP));
  }

  zoomOut() {
    gradingStore.setZoomScale(clampZoom(get(gradingStore).zoomScale - STEP));
  }

  /** Zoom so the current page fits the pane; the other pages are a scroll away. */
  fitToPage() {
    const viewport = this.view.viewport();
    const size = this.view.pageSize(get(gradingStore).currentPage) ?? this.view.pageSize(1);
    const availWidth = (viewport?.clientWidth ?? 0) - 2 * this.view.padding;
    const availHeight = (viewport?.clientHeight ?? 0) - 2 * this.view.padding;
    if (!size || size.w === 0 || size.h === 0 || availWidth <= 0 || availHeight <= 0) {
      gradingStore.setZoomScale(1.0);
      return;
    }
    const scaleX = availWidth / size.w;
    const ratio = Math.min(scaleX, availHeight / size.h) / scaleX;
    gradingStore.setZoomScale(clampZoom(ratio, 0.1));
  }

  /** Svelte 5 registers `onwheel` as passive; ctrl+wheel zoom needs preventDefault, so this action attaches non-passively. A plain wheel scrolls natively. */
  wheelAction = (node: HTMLElement) => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      gradingStore.setZoomScale(clampZoom(get(gradingStore).zoomScale + (e.deltaY < 0 ? STEP : -STEP)));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return { destroy: () => node.removeEventListener("wheel", onWheel) };
  };

  /** Re-fits when the pane width changes (rotating a tablet, opening the score sheet); returns the cleanup. */
  observeResize(): () => void {
    const viewport = this.view.viewport();
    if (!viewport || typeof ResizeObserver === "undefined") return () => {};
    let lastWidth = viewport.clientWidth;
    const observer = new ResizeObserver(() => {
      // Ignore sub-pixel jitter and height-only changes.
      if (Math.abs(viewport.clientWidth - lastWidth) < 24) return;
      lastWidth = viewport.clientWidth;
      this.fitToPage();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }

  /** Call on every zoom change: keeps the same spot of the current page in view, since zooming resizes every page above it. */
  zoomChanged(zoom: number) {
    if (this.lastZoom !== null && this.lastZoom !== zoom) this.keepAnchor();
    this.lastZoom = zoom;
  }

  pinchStart(a: Point, b: Point) {
    this.pinchDistance = distance(a, b);
    this.pinchStartZoom = get(gradingStore).zoomScale;
    this.lastMid = midpoint(a, b);
  }

  /** Two fingers: pinch to zoom, move to scroll. False when no pinch is in progress. */
  pinchMove(a: Point, b: Point): boolean {
    if (this.pinchDistance === null) return false;
    if (this.pinchDistance > 0) gradingStore.setZoomScale(clampZoom((this.pinchStartZoom * distance(a, b)) / this.pinchDistance));
    const mid = midpoint(a, b);
    if (this.lastMid) this.view.viewport()?.scrollBy({ left: this.lastMid.x - mid.x, top: this.lastMid.y - mid.y });
    this.lastMid = mid;
    return true;
  }

  pinchEnd() {
    this.pinchDistance = null;
    this.lastMid = null;
  }

  private keepAnchor() {
    const viewport = this.view.viewport();
    const page = get(gradingStore).currentPage;
    const el = this.view.pageEl(page);
    const top = this.view.pageTop(page);
    if (!viewport || !el || top === null || el.offsetHeight === 0) return;
    const fraction = (viewport.scrollTop - top) / el.offsetHeight;
    void tick().then(() => {
      const newTop = this.view.pageTop(page);
      if (newTop !== null) viewport.scrollTop = newTop + fraction * el.offsetHeight;
    });
  }
}
