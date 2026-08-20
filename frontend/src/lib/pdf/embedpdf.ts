/**
 * Self-hosted, chromeless configuration for EmbedPDF — the WASM (PDFium)
 * based PDF viewer used for read-only previews (compiled Angabe/Lösung
 * PDFs, scanned-submission previews).
 *
 * Two deliberate deviations from the upstream defaults, mirroring the
 * reasoning already documented in `pdf/pdfjs.ts`:
 *
 *  1. By default `@embedpdf/snippet` fetches its PDFium WASM binary, its
 *     non-Latin glyph-fallback fonts, its default rubber-stamp library, and
 *     its toolbar font all from third-party CDNs (`cdn.jsdelivr.net`,
 *     Google Fonts) — confirmed by grepping the built bundle for every
 *     `https://` literal it contains. This app makes no third-party
 *     requests anywhere else; a CDN fetch on every PDF preview would leak
 *     IP/referrer and is exactly what `script-src 'self'` is meant to rule
 *     out. We bundle the WASM file as a local asset (`wasmUrl`), disable the
 *     glyph-fallback and toolbar/signature font CDN requests
 *     (`fontFallback: null`, `fonts: { ui: null, signature: null }`), and
 *     empty out the default stamp library (`stamp: { libraries: [], manifests:
 *     [], defaultLibrary: false }`) — it's also disabled via
 *     `disabledCategories`, but that only hides the *UI* for it; the plugin
 *     still eagerly fetches its default library manifest on init unless the
 *     library/manifest lists themselves are emptied. The bundled WASM's
 *     `?url` import resolves to a path-absolute string (`/assets/...`),
 *     which is fine for a `fetch()` from the main thread but breaks inside
 *     the Worker EmbedPDF creates from a `blob:` URL — such a worker has no
 *     base to resolve a relative URL against, so `fetch()` throws immediately
 *     and the viewer hangs on "Loading document..." forever. It's resolved
 *     to an absolute URL via `new URL(wasmUrl, location.href)` below before
 *     being handed to EmbedPDF.
 *
 *  2. The upstream package ships a full toolbar/sidebar/menu UI (page
 *     navigation, zoom buttons, print, annotate, redact, search, ...). None
 *     of that is needed for a read-only preview pane: users already know how
 *     to zoom with a pinch gesture or the mouse wheel, and scroll to change
 *     pages. `chromelessUiSchema` below is an *empty* UI schema (no
 *     toolbars, menus, sidebars, or modals) so the viewer renders with zero
 *     chrome — the zoom/pan/scroll plugins that drive those gestures keep
 *     working regardless of whether any UI is mounted for them.
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

// Feature categories that have no chrome to trigger them under the
// chromeless schema anyway, but are disabled explicitly so their commands
// (and keyboard shortcuts, e.g. Ctrl+P) don't fire for what is meant to be a
// read-only preview.
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
    // EmbedPDF hands `wasmUrl` off to a Worker created from a `blob:` URL,
    // which has no meaningful base for resolving a path-absolute string
    // (`fetch()` inside it throws "Failed to parse URL from /..." and the
    // worker never recovers — no document ever renders). Vite's `?url`
    // import gives us exactly such a path-absolute string, so resolve it to
    // an absolute URL against the current origin before handing it over.
    wasmUrl: new URL(wasmUrl, window.location.href).href,
    fontFallback: null,
    fonts: { ui: null, signature: null },
    theme: { preference: opts.theme ?? "dark" },
    tabBar: "never",
    ui: { schema: chromelessUiSchema },
    zoom: { defaultZoomLevel: opts.zoomLevel ?? ZoomMode.FitWidth },
    disabledCategories: READONLY_PREVIEW_DISABLED_CATEGORIES,
    // Empty the default stamp library so the plugin has nothing to fetch —
    // see the file-level doc comment above. `manifests` (not `libraries`) is
    // what actually drives the default jsdelivr fetch; both are cleared for
    // good measure, and `defaultLibrary: false` drops the built-in "Custom
    // Stamps" library shell too.
    stamp: { libraries: [], manifests: [], defaultLibrary: false },
  };

  return EmbedPDF.init({ type: "container", target: opts.target, ...config });
}
