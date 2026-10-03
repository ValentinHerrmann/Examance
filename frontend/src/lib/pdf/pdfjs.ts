/**
 * Single entry point for pdf.js. The worker is bundled from `pdfjs-dist` (Vite `?url`), not pulled
 * from cdnjs, because:
 *  1. CSP: `script-src 'self'` / `worker-src 'self' blob:` (static/_headers) blocks a CDN worker,
 *     which would break every PDF view in production.
 *  2. Privacy: exam scans contain student PII; a CDN worker discloses every user's IP and referrer,
 *     a transfer the DSGVO documentation says does not happen.
 * It also avoids version skew with whatever `pdfjsLib.version` resolved to on the CDN.
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
