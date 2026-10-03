/**
 * Self-hosted, chromeless EmbedPDF (PDFium WASM) config for read-only previews. Two deliberate
 * deviations from upstream defaults (see also `pdf/pdfjs.ts`):
 *
 *  1. Upstream fetches its WASM, fallback fonts, default stamp library and toolbar font from
 *     third-party CDNs (jsdelivr, Google Fonts), leaking IP/referrer, which `script-src 'self'`
 *     is meant to rule out. We bundle the WASM (`wasmUrl`), null the fonts (`fontFallback: null`,
 *     `fonts: { ui: null, signature: null }`) and empty the stamp libraries/manifests (the plugin
 *     fetches its default manifest on init even when the UI is hidden via `disabledCategories`).
 *     Vite's `?url` gives a path-absolute string that fails inside EmbedPDF's `blob:` Worker (no
 *     base, viewer hangs on "Loading document..."), so it is resolved via `new URL(wasmUrl, location.href)`.
 *
 *  2. The full toolbar/sidebar/menu UI is unneeded for a read-only preview; `chromelessUiSchema` is
 *     an empty schema, while the zoom/pan/scroll plugins keep working without any UI.
 */
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

// Categories with no chrome to trigger them anyway, disabled explicitly so their commands and
// shortcuts (e.g. Ctrl+P) don't fire in a read-only preview.
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
        // EmbedPDF passes `wasmUrl` to a Worker created from a `blob:` URL, which cannot resolve a
        // path-absolute string (`fetch()` throws and no document renders), so resolve Vite's `?url`
        // against the current origin first.
    wasmUrl: new URL(wasmUrl, window.location.href).href,
    fontFallback: null,
    fonts: { ui: null, signature: null },
    theme: { preference: opts.theme ?? "dark" },
    tabBar: "never",
    ui: { schema: chromelessUiSchema },
    zoom: { defaultZoomLevel: opts.zoomLevel ?? ZoomMode.FitWidth },
    disabledCategories: READONLY_PREVIEW_DISABLED_CATEGORIES,
        // Empty the default stamp library so there is nothing to fetch (see file-level comment).
        // `manifests` drives the default jsdelivr fetch; `libraries` is cleared too, and
        // `defaultLibrary: false` drops the built-in shell.
    stamp: { libraries: [], manifests: [], defaultLibrary: false },
  };

  return EmbedPDF.init({ type: "container", target: opts.target, ...config });
}
