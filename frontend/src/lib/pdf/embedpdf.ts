/** Self-hosted, chromeless EmbedPDF (PDFium WASM) for read-only previews (see also `pdf/pdfjs.ts`). Upstream fetches WASM, fonts and stamp libraries from third-party CDNs (IP/referrer leak, against `script-src 'self'`), so all are bundled or nulled. `wasmUrl` is resolved via `new URL(wasmUrl, location.href)`: Vite's path-absolute `?url` hangs the `blob:` Worker. */
import EmbedPDF, {
  ZoomMode,
  type PDFViewerConfig,
  type UISchema,
  type EmbedPdfContainer,
  type ZoomLevel,
} from "@embedpdf/snippet";
import wasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";

/** No toolbars, menus, sidebars, modals, overlays, or selection menus — just the page(s). */
export const chromelessUiSchema: UISchema = {
  id: "blindgrade-chromeless",
  version: "1",
  toolbars: {},
  menus: {},
  sidebars: {},
  modals: {},
  overlays: {},
  selectionMenus: {},
};

// Categories with no chrome to trigger them anyway, disabled explicitly so their commands and shortcuts (e.g. Ctrl+P) don't fire in a read-only preview.
const READONLY_PREVIEW_DISABLED_CATEGORIES = [
  "annotation",
  "redaction",
  "form",
  "signature",
  "stamp",
  "document-print",
  "export",
  "search",
  "history",
  "attachment",
  "bookmark",
  "thumbnail",
];

export interface EmbedPdfMountOptions {
  target: Element;
  /** URL (including `blob:`) of the PDF to display. */
  src?: string;
  theme?: "light" | "dark" | "system";
  zoomLevel?: ZoomLevel;
  /** The pages have an edit layer (issue #347): no pan mode and no text selection of EmbedPDF's own; the layer owns clicks and drags, touch scrolls natively. */
  editable?: boolean;
}

/** Mounts a chromeless EmbedPDF viewer into `target`. Returns the live container handle. */
export function mountEmbedPdf(opts: EmbedPdfMountOptions): EmbedPdfContainer | undefined {
  const config: PDFViewerConfig = {
    src: opts.src,
        // EmbedPDF passes `wasmUrl` to a Worker created from a `blob:` URL, which cannot resolve a path-absolute string (`fetch()` throws and no document renders), so resolve Vite's `?url` against the current origin first.
    wasmUrl: new URL(wasmUrl, window.location.href).href,
    fontFallback: null,
    fonts: { ui: null, signature: null },
    theme: { preference: opts.theme ?? "dark" },
    tabBar: "never",
    ui: { schema: chromelessUiSchema },
    zoom: { defaultZoomLevel: opts.zoomLevel ?? ZoomMode.FitWidth },
    disabledCategories: opts.editable ? [...READONLY_PREVIEW_DISABLED_CATEGORIES, "selection"] : READONLY_PREVIEW_DISABLED_CATEGORIES,
    ...(opts.editable ? { pan: { defaultMode: "never" as const } } : {}),
        // Empty the default stamp library so there is nothing to fetch (see file-level comment). `manifests` drives the default jsdelivr fetch; `libraries` is cleared too, and `defaultLibrary: false` drops the built-in shell.
    stamp: { libraries: [], manifests: [], defaultLibrary: false },
  };

  return EmbedPDF.init({ type: "container", target: opts.target, ...config });
}

/** EmbedPDF's open shadow root lacks two a11y basics: page `<img>`s without `alt`, and a scroll container that the keyboard cannot reach. This adds both (`pageLabel`, `regionLabel`) and keeps them as pages render; it also gives the scroll container a stable scroll-bar gutter, so fit-width never changes when the pages start or stop overflowing. Returns the stop function. */
export function patchEmbedPdfShadow(target: Element, labels: { pageLabel: string; regionLabel: string }): () => void {
  let observer: MutationObserver | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let frame = 0;
  const scrolls = (el: Element) => {
    const style = getComputedStyle(el);
    return /(auto|scroll)/.test(style.overflowY + style.overflowX);
  };
  const labelImages = (el: Element | ShadowRoot) => {
    if (el instanceof HTMLImageElement && !el.hasAttribute('alt')) el.setAttribute('alt', labels.pageLabel);
    for (const img of el.querySelectorAll('img:not([alt])')) img.setAttribute('alt', labels.pageLabel);
  };
  const fill = (root: ShadowRoot) => {
    frame = 0;
    labelImages(root);
    for (const el of root.querySelectorAll('div:not([tabindex])')) {
      if (!scrolls(el)) continue;
      (el as HTMLElement).style.scrollbarGutter = 'stable';
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'region');
      el.setAttribute('aria-label', labels.regionLabel);
    }
  };
  const attach = () => {
    const root = target.querySelector('embedpdf-container')?.shadowRoot;
    if (!root) {
      timer = setTimeout(attach, 100);
      return;
    }
    fill(root);
    observer = new MutationObserver((records) => {
      // Page images get their alt at once (a mutation callback runs before any later task, so no check sees one without); the costlier scroll-region scan waits a frame.
      for (const r of records) for (const n of r.addedNodes) if (n instanceof Element) labelImages(n);
      frame ||= requestAnimationFrame(() => fill(root));
    });
    observer.observe(root, { childList: true, subtree: true });
  };
  attach();
  return () => {
    if (timer) clearTimeout(timer);
    if (frame) cancelAnimationFrame(frame);
    observer?.disconnect();
  };
}

/** The scroll container inside a mounted viewer's shadow root, once laid out. */
export function embedPdfScroller(target: Element): HTMLElement | null {
  const root = target.querySelector('embedpdf-container')?.shadowRoot;
  if (!root) return null;
  for (const el of root.querySelectorAll('div')) {
    if (/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > 0) return el;
  }
  return null;
}

/** Resolves once a viewer mounted into `target` shows the reader's view sharp (`scroll` applied as soon as the pages are laid out, every page in view at full resolution), or after `timeoutMs`; false when `cancelled()` turned true first. */
export function whenEmbedPdfShown(
  target: Element,
  scroll: { top: number; left: number } | null,
  cancelled: () => boolean,
  timeoutMs = 5000,
  /** Page images of the document this viewer showed before: they do not count as the new one rendered. */
  stale: Set<string> = new Set(),
): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  let scrolled = !scroll;
  return new Promise((resolve) => {
    const check = () => {
      if (cancelled()) return resolve(false);
      if (performance.now() > deadline) return resolve(true);
      const scroller = embedPdfScroller(target);
      if (scroller && !scrolled && scroll && scroller.scrollHeight > scroller.clientHeight) {
        scroller.scrollTop = scroll.top;
        scroller.scrollLeft = scroll.left;
        scrolled = true;
      }
      if (scroller && scrolled && viewSharp(scroller, stale)) return resolve(true);
      requestAnimationFrame(check);
    };
    check();
  });
}

/** The `src` of every page image a mounted viewer shows now. */
export function embedPdfPageImages(target: Element): Set<string> {
  return new Set([...(embedPdfScroller(target)?.querySelectorAll('img') ?? [])].map((img) => img.src));
}

const loaded = (img: HTMLImageElement, stale: Set<string>) => img.complete && img.naturalWidth > 0 && !stale.has(img.src);

/** Whether every page in view is drawn at full resolution: EmbedPDF first shows a low-resolution picture of each page and then sharp tiles over it (in rows and columns), and showing a page before its tiles makes the text blur and sharpen on every recompile. A page counts when its picture alone is sharp enough, or loaded tiles cover a grid of points over its visible part. */
function viewSharp(scroller: HTMLElement, stale: Set<string>): boolean {
  const view = scroller.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  let pages = 0;
  for (const base of scroller.querySelectorAll('img')) {
    if (base.style.position === 'absolute') continue;
    const b = base.getBoundingClientRect();
    const top = Math.max(b.top, view.top);
    const bottom = Math.min(b.bottom, view.bottom);
    if (bottom <= top) continue;
    pages++;
    if (!loaded(base, stale)) return false;
    if (base.naturalWidth >= b.width * dpr * 0.9) continue;
    const tiles = [...(base.parentElement?.parentElement?.querySelectorAll('img') ?? [])]
      .filter((t) => t.style.position === 'absolute' && loaded(t, stale))
      .map((t) => t.getBoundingClientRect());
    if (!coveredGrid(tiles, b.left, b.right, top, bottom)) return false;
  }
  return pages > 0;
}

/** Whether every point of a 9×9 grid inside the rectangle lies on one of `rects`. */
function coveredGrid(rects: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>[], left: number, right: number, top: number, bottom: number): boolean {
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      const x = left + ((right - left) * (i + 0.5)) / 9;
      const y = top + ((bottom - top) * (j + 0.5)) / 9;
      if (!rects.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) return false;
    }
  }
  return true;
}

/** A shown page on screen: client px of its top-left corner, px per PDF point and its size in points. */
export interface PagePlacement {
  page: number;
  left: number;
  top: number;
  scale: number;
  width: number;
  height: number;
}

/** Turns client points into page points and back for a mounted viewer (click-to-source, issue #347), from its scroll and viewport capabilities; never reach into the shadow DOM for this elsewhere. */
export interface PageLocator {
  pointAt(clientX: number, clientY: number): { page: number; x: number; y: number } | null;
  clientOf(page: number, x: number, y: number): { left: number; top: number; scale: number } | null;
}

interface LayoutItem {
  x: number;
  y: number;
  width: number;
  pageLayouts: { pageNumber: number; x: number; y: number; rotatedWidth: number; rotatedHeight: number }[];
}
interface ScrollCapabilityLike {
  getMetrics(): { pageVisibilityMetrics: { scaled: { scale: number } }[] };
  getLayout(): { virtualItems: LayoutItem[]; totalContentSize: { width: number } };
}
interface ViewportCapabilityLike {
  getViewportGap(): number;
}

function capabilityOf<T>(plugin: unknown): T | null {
  const p = plugin as { provides?: () => T; getCapability?: () => T } | null;
  return (p?.provides ? p.provides() : p?.getCapability?.()) ?? null;
}

/** Every page's placement, from the scroll plugin's layout (unscaled points, spreads centred in the content) and the scroller's live scroll offset; its stored visibility metrics can lag behind the real scroll position, so they only give the scale. The viewport pads the content by its gap. */
function placementsOf(target: Element, scroll: ScrollCapabilityLike, gap: number): PagePlacement[] {
  const scroller = embedPdfScroller(target);
  const scale = scroll.getMetrics().pageVisibilityMetrics[0]?.scaled.scale;
  if (!scroller || !scale || scale <= 0) return [];
  const box = scroller.getBoundingClientRect();
  const left0 = box.left + scroller.clientLeft + gap - scroller.scrollLeft;
  const top0 = box.top + scroller.clientTop + gap - scroller.scrollTop;
  const { virtualItems, totalContentSize } = scroll.getLayout();
  return virtualItems.flatMap((item) => {
    const centre = item.width < totalContentSize.width ? (totalContentSize.width - item.width) / 2 : 0;
    return item.pageLayouts.map((p) => ({
      page: p.pageNumber,
      left: left0 + (item.x + centre + p.x) * scale,
      top: top0 + (item.y + p.y) * scale,
      scale,
      width: p.rotatedWidth,
      height: p.rotatedHeight,
    }));
  });
}

/** A locator for the viewer mounted into `target`, once its plugins are ready; null when they are missing. */
export async function embedPdfPageLocator(viewer: EmbedPdfContainer, target: Element): Promise<PageLocator | null> {
  const registry = await viewer.registry;
  const scroll = capabilityOf<ScrollCapabilityLike>(registry.getPlugin("scroll"));
  const gap = capabilityOf<ViewportCapabilityLike>(registry.getPlugin("viewport"))?.getViewportGap() ?? 0;
  if (!scroll) return null;
  return {
    pointAt(clientX, clientY) {
      for (const p of placementsOf(target, scroll, gap)) {
        const x = (clientX - p.left) / p.scale;
        const y = (clientY - p.top) / p.scale;
        if (x >= 0 && y >= 0 && x <= p.width && y <= p.height) return { page: p.page, x, y };
      }
      return null;
    },
    clientOf(page, x, y) {
      const p = placementsOf(target, scroll, gap).find((pl) => pl.page === page);
      return p ? { left: p.left + x * p.scale, top: p.top + y * p.scale, scale: p.scale } : null;
    },
  };
}

interface DocumentManagerLike {
  getActiveDocumentId(): string | null;
  getDocumentOrder(): string[];
  openDocumentUrl(options: { url: string; autoActivate?: boolean }): { toPromise(): Promise<{ documentId: string; task: { toPromise(): Promise<unknown> } }> };
  setActiveDocument(documentId: string): void;
  closeDocument(documentId: string): { toPromise(): Promise<unknown> };
}
interface ZoomCapabilityLike {
  forDocument(documentId: string): { requestZoom(level: ZoomLevel): void };
}

/** Loads `url` into an already mounted viewer, in place of its documents: the PDFium engine and the viewer stay, so a recompiled PDF shows much faster than in a new viewer (live preview, issue #347). The zoom carries over; the caller restores the scroll position (`whenEmbedPdfShown`) and never runs two of these on one viewer at a time. False when the viewer cannot do it. */
export async function replaceEmbedPdfDocument(viewer: EmbedPdfContainer, url: string, zoomLevel: ZoomLevel | undefined): Promise<boolean> {
  const registry = await viewer.registry;
  const docs = capabilityOf<DocumentManagerLike>(registry.getPlugin("document-manager"));
  if (!docs) return false;
  const { documentId, task } = await docs.openDocumentUrl({ url, autoActivate: false }).toPromise();
  await task.toPromise();
  if (zoomLevel !== undefined) capabilityOf<ZoomCapabilityLike>(registry.getPlugin("zoom"))?.forDocument(documentId).requestZoom(zoomLevel);
  docs.setActiveDocument(documentId);
  // Every other document goes, not only the one that was active: a viewer keeps exactly the PDF it shows.
  for (const other of docs.getDocumentOrder()) if (other !== documentId) void docs.closeDocument(other).toPromise().catch(() => undefined);
  return true;
}
