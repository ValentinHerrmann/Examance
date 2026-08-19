import { describe, it, expect, beforeEach, vi } from 'vitest';

// `fetchInterceptor.ts` is a module with a top-level side effect: on first
// import it monkey-patches `globalThis.fetch` (guarded by the
// `__busytex_fetch_intercepted__` sentinel so it only installs once). To get
// a fresh install for every test case we reset the module registry and clear
// the sentinel/patched fetch before each `import()`.
async function loadInterceptor() {
  vi.resetModules();
  delete (globalThis as any).__busytex_fetch_intercepted__;
  await import('../src/lib/latex/fetchInterceptor');
}

function textBody(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

// Node's current DOM lib typings for `Response`'s `BodyInit` union don't
// accept `Uint8Array<ArrayBufferLike>` directly (a lib-version quirk, not a
// real runtime restriction). Cast at the boundary to keep the test bodies
// readable.
function asBody(bytes: Uint8Array): BodyInit {
  return bytes as unknown as BodyInit;
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(asBody(bytes)).body!.pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

describe('busytex fetch interceptor', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  it('passes through untouched for URLs that are not in the chunk manifest', async () => {
    const manifest = {};
    const passthroughResponse = new Response('hello', { status: 200 });

    const mockFetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.endsWith('/core/busytex/chunk-manifest.json')) {
        return new Response(JSON.stringify(manifest), { status: 200 });
      }
      if (u === '/some/other/asset.txt') {
        return passthroughResponse;
      }
      throw new Error(`unexpected fetch: ${u}`);
    });

    globalThis.fetch = mockFetch as any;
    try {
      await loadInterceptor();
      const res = await globalThis.fetch('/some/other/asset.txt');
      expect(await res.text()).toBe('hello');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('reassembles a single-chunk gzipped asset and exposes the decompressed bytes', async () => {
    const original = textBody('the quick brown fox jumps over the lazy dog');
    const gzipped = await gzip(original);

    const manifest = {
      '/core/busytex/texlive-extra.data': {
        chunks: ['/core/busytex/texlive-extra.data.bin.part0'],
        gzipped: true,
        gzippedSize: gzipped.byteLength
      }
    };

    const mockFetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.endsWith('/core/busytex/chunk-manifest.json')) {
        return new Response(JSON.stringify(manifest), { status: 200 });
      }
      if (u === '/core/busytex/texlive-extra.data.bin.part0') {
        return new Response(asBody(gzipped), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${u}`);
    });

    globalThis.fetch = mockFetch as any;
    try {
      await loadInterceptor();
      const res = await globalThis.fetch('/core/busytex/texlive-extra.data');
      const buf = new Uint8Array(await res.arrayBuffer());
      expect(new TextDecoder().decode(buf)).toBe(new TextDecoder().decode(original));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('reassembles a multi-chunk asset by concatenating chunks in order', async () => {
    const part0 = textBody('AAAA');
    const part1 = textBody('BBBB');
    const combined = new Uint8Array([...part0, ...part1]);

    const manifest = {
      '/core/busytex/texlive-extra.data': {
        chunks: [
          '/core/busytex/texlive-extra.data.bin.part0',
          '/core/busytex/texlive-extra.data.bin.part1'
        ],
        gzipped: false,
        gzippedSize: combined.byteLength
      }
    };

    const mockFetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.endsWith('/core/busytex/chunk-manifest.json')) {
        return new Response(JSON.stringify(manifest), { status: 200 });
      }
      if (u === '/core/busytex/texlive-extra.data.bin.part0') return new Response(asBody(part0), { status: 200 });
      if (u === '/core/busytex/texlive-extra.data.bin.part1') return new Response(asBody(part1), { status: 200 });
      throw new Error(`unexpected fetch: ${u}`);
    });

    globalThis.fetch = mockFetch as any;
    try {
      await loadInterceptor();
      const res = await globalThis.fetch('/core/busytex/texlive-extra.data');
      const buf = new Uint8Array(await res.arrayBuffer());
      expect(new TextDecoder().decode(buf)).toBe(new TextDecoder().decode(combined));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // Regression test for the root cause behind spurious
  // "File `ulem.sty' not found" style errors: a truncated/corrupted chunk
  // download used to be silently mounted into the virtual filesystem as a
  // short/garbled file, producing a confusing "package not found" LaTeX
  // error instead of a clear "download is corrupted" signal. The fix makes
  // a byte-count mismatch between the declared and actually-received size
  // surface as a hard stream error instead.
  it('errors the response body stream instead of silently truncating when a single chunk download is short', async () => {
    const original = textBody('this payload is definitely more than eight bytes long');
    const truncated = original.slice(0, 8); // simulate a cut-off download

    const manifest = {
      '/core/busytex/texlive-extra.data': {
        chunks: ['/core/busytex/texlive-extra.data.bin.part0'],
        gzipped: false,
        gzippedSize: original.byteLength
      }
    };

    const mockFetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.endsWith('/core/busytex/chunk-manifest.json')) {
        return new Response(JSON.stringify(manifest), { status: 200 });
      }
      if (u === '/core/busytex/texlive-extra.data.bin.part0') {
        return new Response(asBody(truncated), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${u}`);
    });

    globalThis.fetch = mockFetch as any;
    try {
      await loadInterceptor();
      const res = await globalThis.fetch('/core/busytex/texlive-extra.data');
      // The interceptor still returns a Response synchronously (streaming);
      // the integrity failure only becomes visible once the body is read.
      await expect(res.arrayBuffer()).rejects.toThrow(/Incomplete download/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('falls back to the original fetch when one of several chunk requests fails outright', async () => {
    const manifest = {
      '/core/busytex/texlive-extra.data': {
        chunks: [
          '/core/busytex/texlive-extra.data.bin.part0',
          '/core/busytex/texlive-extra.data.bin.part1'
        ],
        gzipped: false,
        gzippedSize: 100
      }
    };

    const fallbackResponse = new Response('fallback body', { status: 502 });

    const mockFetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.endsWith('/core/busytex/chunk-manifest.json')) {
        return new Response(JSON.stringify(manifest), { status: 200 });
      }
      if (u === '/core/busytex/texlive-extra.data.bin.part0') {
        return new Response(asBody(textBody('AAAA')), { status: 200 });
      }
      if (u === '/core/busytex/texlive-extra.data.bin.part1') {
        return new Response(null, { status: 500 });
      }
      if (u === '/core/busytex/texlive-extra.data') {
        // Fallback call made by the interceptor after the chunked path throws.
        return fallbackResponse;
      }
      throw new Error(`unexpected fetch: ${u}`);
    });

    globalThis.fetch = mockFetch as any;
    try {
      await loadInterceptor();
      const res = await globalThis.fetch('/core/busytex/texlive-extra.data');
      expect(res.status).toBe(502);
      expect(await res.text()).toBe('fallback body');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
