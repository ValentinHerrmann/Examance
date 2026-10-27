import { describe, expect, it } from 'vitest';
import { buildAiPrompt, explainTexErrors } from '#lib/latex/errorHelp';

const enc = (s: string) => new TextEncoder().encode(s);
const UNDEFINED = [
  'This is XeTeX',
  '! Undefined control sequence.',
  'l.3 Text \\foo    [Exercise “Ex”, line 2]',
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

  it('prefers the specific Schulaufgabe package hint over the generic one', () => {
    expect(explainTexErrors("! Package Schulaufgabe Error: Package `foo' was not loaded").map((c) => c.id)).toEqual(['bodyPackage']);
  });
});

describe('buildAiPrompt', () => {
  // Line 1 frame, lines 2-4 the exercise "Ex", then 400 lines of frame.
  const source = ['\\documentclass{article}', '\\Lehrernachname{Secret}', '\\begin{document}', 'a', 'Text \\foo', 'x^2']
    .concat(Array.from({ length: 400 }, (_, i) => `frame ${i}`))
    .join('\n');
  const ranges = [{ label: 'Ex', start: 4, end: 6 }];
  const log = UNDEFINED.replace('l.3 ', 'l.5 ').replace('l.4 ', 'l.6 ');
  const base = { log, engine: 'server' as const, source, ranges, locale: 'de' };

  it('explains the setup, asks for the UI language and leaves the code out unless asked', () => {
    const prompt = buildAiPrompt({ ...base, includeSource: false });
    expect(prompt).toContain('Reply in German');
    expect(prompt).toContain('Tectonic');
    expect(prompt).toContain('\\LoesungKaro{solution}{rows}');
    expect(prompt).toContain('! Undefined control sequence.');
    expect(prompt).not.toContain('2| Text \\foo');
    expect(prompt).not.toContain('Secret');
  });

  it('includes the affected exercise numbered like the editor on request', () => {
    const prompt = buildAiPrompt({ ...base, includeSource: true });
    expect(prompt).toContain('Exercise "Ex"');
    expect(prompt).toContain('2| Text \\foo');
    expect(prompt).not.toContain('frame 300');
  });

  it('caps the log tail and adds the definition of a template command named in the error', () => {
    const noise = Array.from({ length: 100 }, (_, i) => `noise ${i} ${'x'.repeat(100)}`).join('\n');
    const longLog = noise + '\n! Undefined control sequence.\nl.5 \\LoesungKaro{x}\n';
    const assets = [{ path: 'sty/Loesung.sty', content: enc('\\newcommand{\\LoesungKaro}[2] {\n  #1 grid\n}\n') }];
    const prompt = buildAiPrompt({ ...base, log: longLog, includeSource: false, assets });
    expect(prompt).not.toContain('noise 0 ');
    expect(prompt).toContain('noise 99 ');
    expect(prompt).toContain('#1 grid');
  });
});
