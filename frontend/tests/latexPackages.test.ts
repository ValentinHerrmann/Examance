import { describe, expect, it } from 'vitest';
import { exerciseEntries } from '../src/lib/latex/packages';
import { timeMs } from './helpers/randomStrings';

describe('exerciseEntries regexes (SonarCloud S5843)', () => {
  it('reads options with braced groups', () => {
    expect(exerciseEntries(String.raw`\usepackage[a={b,c}, d]{tikz}`)).toEqual([
      expect.objectContaining({ kind: 'package', name: 'tikz' }),
    ]);
  });

  it('ignores package commands inside inline verbatim', () => {
    expect(exerciseEntries(String.raw`\verb|\usepackage{xcolor}| and \lstinline[x]!\usepackage{y}!`)).toEqual([]);
    expect(exerciseEntries(String.raw`\verb+a+ \usepackage{xcolor}`)).toEqual([expect.objectContaining({ name: 'xcolor' })]);
  });

  it('stays linear on an unclosed \\verb', () => {
    expect(timeMs(() => exerciseEntries(String.raw`\verb|` + 'a'.repeat(100_000)))).toBeLessThan(500);
  });
});
