import { describe, expect, it } from 'vitest';
import {
  exerciseEntries,
  LAZY_PACKAGES,
  packagePreamble,
  resolvePackages,
  type LatexPackageEntry,
} from '../src/lib/latex/packages';
import { QUICK_INSERT_MACROS } from '../src/lib/latex/quickInsertMacros';
import { SUBJECT_SNIPPETS } from '../src/lib/latex/subjectSnippets';
import _fixtures from '../../backend/tests/fixtures/latex_package_blocks.json';
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

describe('subject packages load only when used (issue #341)', () => {
  const needs: Record<string, RegExp> = {
    struktex: /\\begin\{struktogramm\}/,
    listings: /\\begin\{lstlisting\}|\\lstinline/,
    chemfig: /\\chemfig/,
    circuitikz: /\\begin\{circuitikz\}/,
    mhchem: /\\ce\{/,
    'sty/tikz-uml': /\\uml[a-z]+|\\begin\{uml/,
    'sty/custom-pgf-umlcd': /\\begin\{(class|interface|abstractclass|object)\}/,
  };
  const loaded = (text: string, allSubject = false) =>
    resolvePackages([], text, allSubject).packages.map((p) => p.name);

  it('every snippet of the palette triggers the packages it needs', () => {
    for (const macro of [...SUBJECT_SNIPPETS, ...QUICK_INSERT_MACROS]) {
      const names = loaded(macro.preview);
      for (const [name, pattern] of Object.entries(needs)) {
        if (pattern.test(macro.preview)) expect(names, `${macro.id} needs ${name}`).toContain(name);
      }
    }
  });

  it('every lazy package has triggers', () => {
    for (const lazy of LAZY_PACKAGES) expect(lazy.triggers.length).toBeGreaterThan(0);
  });

  it('plain text loads none of them, the account switch loads all', () => {
    expect(loaded('Hallo $x$')).toEqual([]);
    expect(loaded('Hallo', true)).toEqual(LAZY_PACKAGES.map((p) => p.name));
  });

  const fixtures = _fixtures as { name: string; doc: string; account: LatexPackageEntry[]; allSubject: boolean; block: string }[];
  const withoutHeader = (block: string) => block.split('\n').filter((line) => !line.startsWith('% LaTeX packages')).join('\n');

  it.each(fixtures.map((f) => [f.name, f] as const))('emits the block the backend does: %s', (_name, f) => {
    const block = packagePreamble(resolvePackages([{ source: 'account', entries: f.account }], f.doc, f.allSubject));
    expect(withoutHeader(block)).toBe(withoutHeader(f.block));
  });
});
