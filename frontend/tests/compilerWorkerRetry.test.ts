import { describe, it, expect, beforeAll } from 'vitest';

// `compiler.worker.ts` is written to run as a dedicated Worker and assigns
// `self.onmessage` as a top-level side effect on import. `self` doesn't
// exist in Vitest's default Node test environment, so we polyfill it with
// `globalThis` (as most engines do internally for Worker/Window scopes)
// purely so the module can be imported to exercise its pure, exported
// helper functions.
beforeAll(() => {
  if (typeof (globalThis as any).self === 'undefined') {
    (globalThis as any).self = globalThis;
  }
});

describe('looksLikeMissingBundledPackage', () => {
  it('detects the exact error signature from the original bug report', async () => {
    const { looksLikeMissingBundledPackage } = await import('../src/lib/latex/compiler.worker');
    expect(looksLikeMissingBundledPackage("! LaTeX Error: File `ulem.sty' not found.")).toBe(true);
  });

  it('detects missing .cls/.clo/.def/.cfg/.fd files too', async () => {
    const { looksLikeMissingBundledPackage } = await import('../src/lib/latex/compiler.worker');
    expect(looksLikeMissingBundledPackage("! LaTeX Error: File `article.cls' not found.")).toBe(true);
    expect(looksLikeMissingBundledPackage("! LaTeX Error: File `foo.clo' not found.")).toBe(true);
    expect(looksLikeMissingBundledPackage("! LaTeX Error: File `foo.def' not found.")).toBe(true);
    expect(looksLikeMissingBundledPackage("! LaTeX Error: File `foo.cfg' not found.")).toBe(true);
    expect(looksLikeMissingBundledPackage("! LaTeX Error: File `foo.fd' not found.")).toBe(true);
  });

  it('does not match unrelated compile failures (so we do not retry-loop on real document errors)', async () => {
    const { looksLikeMissingBundledPackage } = await import('../src/lib/latex/compiler.worker');
    expect(looksLikeMissingBundledPackage('! Undefined control sequence.')).toBe(false);
    expect(looksLikeMissingBundledPackage('! Missing $ inserted.')).toBe(false);
    expect(looksLikeMissingBundledPackage(undefined)).toBe(false);
    expect(looksLikeMissingBundledPackage(null)).toBe(false);
    expect(looksLikeMissingBundledPackage('')).toBe(false);
  });

  it('does not match "File not found" for non-package file extensions (e.g. missing images)', async () => {
    const { looksLikeMissingBundledPackage } = await import('../src/lib/latex/compiler.worker');
    expect(looksLikeMissingBundledPackage("! LaTeX Error: File `photo.png' not found.")).toBe(false);
  });
});
