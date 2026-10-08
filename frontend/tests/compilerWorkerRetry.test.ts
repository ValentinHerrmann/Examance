import { describe, it, expect, beforeAll } from 'vitest';

// `compiler.worker.ts` assigns `self.onmessage` on import, and `self` doesn't exist in Vitest's
// Node environment; polyfill it with `globalThis` so the pure exported helpers can be imported.
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

describe('describeCompileFailure', () => {
  const fatal = 'xdvipdfmx:fatal: Could not open specified DVI (or XDV) file: main.xdv';

  it('reports the XeTeX errors when the log only shows the follow-up xdvipdfmx fatal', async () => {
    const { describeCompileFailure } = await import('../src/lib/latex/compiler.worker');
    const message = describeCompileFailure({
      log: fatal,
      logs: [
        { cmd: 'xetex --no-pdf main.tex', log: '(./main.tex\n! Undefined control sequence.\nl.4 \\foo\n', exit_code: 1 },
        { cmd: 'xdvipdfmx -o main.pdf main.xdv', stderr: fatal, exit_code: 1 }
      ]
    });
    expect(message).toBe('! Undefined control sequence.\nl.4 \\foo');
  });

  it('falls back to the full log when no XeTeX error can be found', async () => {
    const { describeCompileFailure } = await import('../src/lib/latex/compiler.worker');
    expect(describeCompileFailure({ log: fatal })).toBe(fatal);
    expect(describeCompileFailure({ log: fatal, logs: [{ cmd: 'xetex', log: 'nothing', exit_code: 1 }] })).toBe(fatal);
  });

  it('leaves every other failure untouched', async () => {
    const { describeCompileFailure } = await import('../src/lib/latex/compiler.worker');
    expect(describeCompileFailure({ log: '! Missing $ inserted.' })).toBe('! Missing $ inserted.');
    expect(describeCompileFailure({ log: '' })).toBe('Compilation failed');
  });
});
