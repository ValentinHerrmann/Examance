import { describe, it, expect } from 'vitest';
import { annotateLog, extractSourceMap, mapLine, markSource } from '../src/lib/latex/sourceMap';
import { formatExerciseLatex, formatMcGroupLatex } from '../src/lib/latex/scoreParser';

const BODIES = ['', 'a', 'a\n', 'a\nb\n\n', '\\begin{Aufgabe}{x}\nfoo\n\\end{Aufgabe}'];

describe('sourceMap', () => {
  it('strips markers back to the exact unmarked document', () => {
    for (const body of BODIES) {
      expect(extractSourceMap(`pre\n${markSource(body, 'Ex')}\npost`).tex).toBe(`pre\n${body}\npost`);
    }
  });

  it('leaves formatted exercises and MC groups unchanged once stripped', () => {
    for (const body of BODIES) {
      for (const id of [undefined, 'ex-1']) {
        const marked = `pre\n${formatExerciseLatex(body, 'T', id, 'Ex')}\npost`;
        expect(extractSourceMap(marked).tex).toBe(`pre\n${formatExerciseLatex(body, 'T', id)}\npost`);
      }
    }
    const members = BODIES.map((latexBody, i) => ({ id: `m${i}`, latexBody }));
    const marked = formatMcGroupLatex(members.map((m) => ({ ...m, sourceLabel: m.id })), 'G', 'S');
    expect(extractSourceMap(marked).tex).toBe(formatMcGroupLatex(members, 'G', 'S'));
  });

  it('maps a document line to the exercise line', () => {
    const map = extractSourceMap(`head\n${markSource('one\n\\foo bar\nthree', 'Bruch')}\nend`);
    expect(map.ranges).toEqual([{ label: 'Bruch', start: 2, end: 4 }]);
    expect(mapLine(map, 3, '\\foo')).toEqual({ label: 'Bruch', line: 2 });
    expect(mapLine(map, 1)).toEqual({ label: null, line: 1 });
  });

  it('leaves errors inside package files unmapped', () => {
    const map = extractSourceMap(`head\n${markSource('one\ntwo', 'Ex')}`);
    expect(mapLine(map, 2, '\\somePackageInternal')).toBeNull();
    expect(annotateLog('l.2 \\somePackageInternal', map, () => 'x')).toBe('l.2 \\somePackageInternal');
  });
});
