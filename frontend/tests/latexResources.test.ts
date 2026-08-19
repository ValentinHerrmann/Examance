import { describe, expect, it } from 'vitest';

import {
  MAX_COMPILE_RESOURCE_BYTES,
  ResourceError,
  insertSnippetFor,
  mergeResources,
  sanitizeResourceName,
} from '../src/lib/latex/resources';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('sanitizeResourceName', () => {
  it('keeps a plain filename intact', () => {
    expect(sanitizeResourceName('figure.png')).toBe('figure.png');
  });

  it('drops directory components — resources live flat next to main.tex', () => {
    expect(sanitizeResourceName('../../etc/passwd.png')).toBe('passwd.png');
    expect(sanitizeResourceName('C:\\images\\plot.pdf')).toBe('plot.pdf');
  });

  it('replaces characters LaTeX cannot address', () => {
    expect(sanitizeResourceName('Bild 1 (final).PNG')).toBe('Bild_1__final_.PNG');
  });

  it('rejects a name that sanitises down to nothing', () => {
    expect(() => sanitizeResourceName('...')).toThrow(ResourceError);
  });
});

describe('mergeResources', () => {
  it('deduplicates identical files sharing a name', () => {
    const merged = mergeResources([
      { filename: 'fig.png', content: bytes('same'), owner: 'Ex1' },
      { filename: 'fig.png', content: bytes('same'), owner: 'Ex2' },
    ]);
    expect(merged).toHaveLength(1);
  });

  it('refuses different files sharing a name, naming both exercises', () => {
    expect(() =>
      mergeResources([
        { filename: 'fig.png', content: bytes('a'), owner: 'Ex1' },
        { filename: 'fig.png', content: bytes('b'), owner: 'Ex2' },
      ])
    ).toThrow(/Ex1 and Ex2/);
  });

  it('enforces the per-compilation total', () => {
    const big = new Uint8Array(MAX_COMPILE_RESOURCE_BYTES + 1);
    expect(() => mergeResources([{ filename: 'big.bin', content: big }])).toThrow(ResourceError);
  });
});

describe('insertSnippetFor', () => {
  it('uses includegraphics for images and PDFs', () => {
    expect(insertSnippetFor('figure.png')).toContain('\\includegraphics');
    expect(insertSnippetFor('plot.pdf')).toContain('\\includegraphics');
  });

  it('inputs .tex fragments and leaves anything else as a bare name', () => {
    expect(insertSnippetFor('data.tex')).toBe('\\input{data.tex}');
    expect(insertSnippetFor('values.csv')).toBe('values.csv');
  });
});
