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
    disabledCategories: READONLY_PREVIEW_DISABLED_CATEGORIES,
        // Empty the default stamp library so there is nothing to fetch (see file-level comment). `manifests` drives the default jsdelivr fetch; `libraries` is cleared too, and `defaultLibrary: false` drops the built-in shell.
    stamp: { libraries: [], manifests: [], defaultLibrary: false },
  };

  return EmbedPDF.init({ type: "container", target: opts.target, ...config });
}

/** EmbedPDF's open shadow root lacks two a11y basics: page `<img>`s without `alt`, and a scroll container that the keyboard cannot reach. This adds both (`pageLabel`, `regionLabel`) and keeps them as pages render. Returns the stop function. */
export function patchEmbedPdfA11y(target: Element, labels: { pageLabel: string; regionLabel: string }): () => void {
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

/** Resolves once a viewer mounted into `target` shows a rendered page where the reader was (`scroll`, applied as soon as the pages are laid out), or after `timeoutMs`; false when `cancelled()` turned true first. */
export function whenEmbedPdfShown(
  target: Element,
  scroll: { top: number; left: number } | null,
  cancelled: () => boolean,
  timeoutMs = 5000,
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
      if (scroller && scrolled && visiblePageRendered(scroller)) return resolve(true);
      setTimeout(check, 50);
    };
    check();
  });
}

function visiblePageRendered(scroller: HTMLElement): boolean {
  const view = scroller.getBoundingClientRect();
  for (const img of scroller.querySelectorAll('img')) {
    const r = img.getBoundingClientRect();
    if (r.bottom > view.top && r.top < view.bottom && img.complete && img.naturalWidth > 0) return true;
  }
  return false;
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
