import { describe, expect, it } from 'vitest';
import { setLocale } from '#lib/i18n';
import { buildAiPrompt, explainTexErrors } from '#lib/latex/errorHelp';

setLocale('en');

const enc = (s: string) => new TextEncoder().encode(s);
const UNDEFINED = [
  'This is XeTeX',
  '! Undefined control sequence.',
  'l.3 Text \\foo',
  '               bar',
  '! Missing $ inserted.',
  'l.4 x^2',
  '',
].join('\n');

describe('explainTexErrors', () => {
  it('names the undefined macro and lists each cause once', () => {
    const causes = explainTexErrors(UNDEFINED + UNDEFINED);
    expect(causes).toEqual([{ id: 'undefinedControl', detail: '\\foo' }, { id: 'missingDollar' }]);
  });

  it('reports an emergency stop only when nothing else matched', () => {
    expect(explainTexErrors('! Emergency stop.\n')).toEqual([{ id: 'emergencyStop' }]);
    expect(explainTexErrors('! Missing $ inserted.\n! Emergency stop.\n').map((c) => c.id)).toEqual(['missingDollar']);
  });

  it('returns nothing for an empty log', () => {
    expect(explainTexErrors('')).toEqual([]);
  });
});

describe('buildAiPrompt', () => {
  const source = Array.from({ length: 400 }, (_, i) => `line ${i + 1}`).join('\n');

  it('leaves the source out unless asked', () => {
    const prompt = buildAiPrompt({ log: UNDEFINED, engine: 'server', source, includeSource: false });
    expect(prompt).toContain('! Undefined control sequence.');
    expect(prompt).toContain('Tectonic');
    expect(prompt).not.toContain('line 3\n');
  });

  it('includes numbered lines around the error on request', () => {
    const prompt = buildAiPrompt({ log: UNDEFINED, engine: 'local', source, includeSource: true });
    expect(prompt).toContain('  3| line 3');
    expect(prompt).not.toContain('line 300');
  });

  it('caps the log tail and adds the definition of a template macro named in the error', () => {
    const log = 'x'.repeat(10_000) + '\n' + '! Undefined control sequence.\nl.3 \\Punkte{x}\n';
    const assets = [{ path: 'sty/Schulaufgabe.sty', content: enc('\\newcommand{\\Punkte}[1]{%\n  #1 P.\n}\n\\def\\Other{}\n') }];
    const prompt = buildAiPrompt({ log, engine: 'local', includeSource: false, assets });
    expect(prompt.length).toBeLessThan(6000);
    expect(prompt).toContain('sty/Schulaufgabe.sty: \\Punkte \\Other');
    expect(prompt).toContain('#1 P.');
  });
});
