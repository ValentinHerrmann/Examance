import { describe, it, expect } from 'vitest';
import { annotateLog, extractSourceMap, mapLine, markSource } from '../src/lib/latex/sourceMap';

describe('sourceMap', () => {
  it('strips markers back to the exact unmarked document', () => {
    for (const body of ['a', 'a\n', 'a\nb\n\n']) {
      const plain = `pre\n${body}\npost`;
      expect(extractSourceMap(`pre\n${markSource(body, 'Ex')}\npost`).tex).toBe(plain);
    }
    expect(markSource('', 'Ex')).toBe('');
  });

  it('maps a document line to the exercise line', () => {
    const map = extractSourceMap(`head\n${markSource('one\n\\foo bar\nthree', 'Bruch')}\nend`);
    expect(mapLine(map, 3, '\\foo')).toEqual({ label: 'Bruch', line: 2 });
    expect(mapLine(map, 1)).toEqual({ label: null, line: 1 });
  });

  it('leaves errors inside package files unmapped', () => {
    const map = extractSourceMap(`head\n${markSource('one\ntwo', 'Ex')}`);
    expect(mapLine(map, 2, '\\somePackageInternal')).toBeNull();
    expect(annotateLog('l.2 \\somePackageInternal', map, () => 'x')).toBe('l.2 \\somePackageInternal');
  });
});
