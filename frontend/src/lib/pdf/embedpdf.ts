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
