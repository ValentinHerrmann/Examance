import { describe, expect, it, vi } from 'vitest';

const getDocument = vi.fn((params: unknown) => ({ params }));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ getDocument, GlobalWorkerOptions: { workerSrc: '' }, OPS: {} }));
vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url', () => ({ default: '/worker.mjs' }));

import { loadPdfjs, PDFJS_WASM_PATH } from '../src/lib/pdf/pdfjs';

describe('loadPdfjs', () => {
  it('passes the same-origin wasmUrl, without which JBIG2 scan layers render blank', async () => {
    const pdfjs = await loadPdfjs();
    const data = new Uint8Array([1]);
    pdfjs.getDocument({ data });
    const params = getDocument.mock.calls[0][0] as { wasmUrl: string; data: Uint8Array };
    expect(params.wasmUrl.endsWith(PDFJS_WASM_PATH)).toBe(true);
    expect(params.data).toBe(data);
  });

  it('keeps a wasmUrl the caller sets', async () => {
    const pdfjs = await loadPdfjs();
    pdfjs.getDocument({ data: new Uint8Array([1]), wasmUrl: 'https://example.test/wasm/' });
    expect((getDocument.mock.calls.at(-1)![0] as { wasmUrl: string }).wasmUrl).toBe('https://example.test/wasm/');
  });
});
