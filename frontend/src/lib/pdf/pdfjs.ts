/**
 * Single entry point for pdf.js.
 *
 * The worker is bundled from the installed `pdfjs-dist` (via Vite's `?url`
 * import) instead of being pulled from cdnjs at runtime. Two reasons:
 *
 *  1. CSP — the deployed origin ships `script-src 'self'` / `worker-src 'self'
 *     blob:` (see static/_headers). A worker fetched from a third-party CDN is
 *     blocked outright, so every PDF view would fail in production while
 *     working in dev.
 *  2. Privacy — this app processes exam scans containing student PII. Loading
 *     the worker from a CDN discloses every user's IP and referrer to a third
 *     party on every PDF open, which is exactly the kind of transfer the
 *     project's DSGVO documentation says does not happen.
 *
 * Bundling also removes the version skew between the installed pdfjs-dist and
 * whatever `pdfjsLib.version` happened to resolve to on the CDN.
 */
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

type PdfjsModule = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfjsModule> | null = null;

/** Load pdf.js with its worker configured. Safe to call repeatedly. */
export function loadPdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ??= import('pdfjs-dist').then((pdfjsLib) => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    return pdfjsLib;
  });
  return pdfjsPromise;
}
