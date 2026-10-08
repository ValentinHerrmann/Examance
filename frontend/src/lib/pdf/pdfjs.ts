/**
 * Single entry point for pdf.js. The worker is bundled from `pdfjs-dist` (Vite `?url`), never a CDN: `script-src 'self'` /
 * `worker-src 'self' blob:` (static/_headers) would block it, and a CDN worker discloses every user's IP and referrer while
 * exam scans hold student PII (the DSGVO documentation says no such transfer happens).
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
