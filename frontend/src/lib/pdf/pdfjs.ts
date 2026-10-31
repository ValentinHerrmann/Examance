/** Single entry point for pdf.js. The worker is bundled from `pdfjs-dist` (Vite `?url`), never a CDN: `script-src 'self'` / `worker-src 'self' blob:` (static/_headers) would block it, and a CDN worker discloses every user's IP and referrer while exam scans hold student PII (the DSGVO documentation says no such transfer happens). */
// Legacy build: it bundles polyfills (e.g. Map#getOrInsertComputed) that the modern build expects natively, so scans also render in the slightly older browsers school devices run.
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

type PdfjsModule = typeof import('pdfjs-dist');
type DocumentParams = Exclude<Parameters<PdfjsModule['getDocument']>[0], string | URL | ArrayBuffer | ArrayLike<number> | undefined>;

/** Same-origin copy of `pdfjs-dist/wasm/` (vite.config.ts `pdfjsWasmPlugin`). pdf.js 6 decodes JBIG2, JPX and ICC only with these files: without them a scanner's compressed ink layer is silently skipped and the page renders nearly blank. */
export const PDFJS_WASM_PATH = '/pdfjs/wasm/';

let pdfjsPromise: Promise<PdfjsModule> | null = null;

/** Load pdf.js with its worker configured; its `getDocument` supplies `wasmUrl` unless the caller sets one. Safe to call repeatedly. */
export function loadPdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ??= (import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<PdfjsModule>).then((pdfjsLib) => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    const wasmUrl = new URL(PDFJS_WASM_PATH, globalThis.location?.origin ?? 'http://localhost').href;
    const getDocument = ((src: DocumentParams) =>
      pdfjsLib.getDocument({ wasmUrl, ...src })) as PdfjsModule['getDocument'];
    return { ...pdfjsLib, getDocument };
  });
  return pdfjsPromise;
}
