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

describe('buildAiPrompt privacy and context', () => {
  const header = ['\\documentclass{article}', '\\Lehrernachname{Müller}', '\\Klasse{9b}', '\\begin{document}', 'Text', '\\ExamNotes{Notizen}{Rechnung zu Aufgabe 2}{3}{8}'];
  const source = header.join('\n');

  it('redacts header values and header lines from the log, also without the source', () => {
    const log = [
      '! Missing $ inserted.',
      '<argument> Müller',
      'l.2 \\Lehrernachname{Müller}',
      '! Undefined control sequence.',
      'l.6 \\ExamNotes{Notizen}{Rechnung zu Aufgabe 2}',
      '                                  {3}{8}',
    ].join('\n');
    const prompt = buildAiPrompt({ log, engine: 'local', source, ranges: [], includeSource: true, locale: 'en' });
    expect(prompt).not.toContain('Müller');
    expect(prompt).not.toContain('Rechnung zu Aufgabe 2');
    expect(prompt).not.toContain('Notizen');
    expect(prompt).toContain('[omitted]');
    const withoutSource = buildAiPrompt({ log: 'l.9 \\Klasse{9b}', engine: 'local', includeSource: false, locale: 'en' });
    expect(withoutSource).not.toContain('9b');
  });

  it('quotes whole template definitions, not lines that merely use the name', () => {
    const sty = [
      '\\renewcommand{\\theTeilaufgabe}{\\alph{Teilaufgabe}}',
      '\\newenvironment{Teilaufgabe}[2][]',
      '{%',
      '    PART BEGIN',
      '}',
      '{%',
      '    PART END',
      '}',
      '',
      '\\newcommand{\\FestePunkte}[1]{50\\% #1}',
      'UNRELATED LINE',
    ].join('\n');
    const assets = [{ path: 'sty/Schulaufgabe.sty', content: enc(sty) }];
    const log = '! LaTeX Error: \\begin{Teilaufgabe} on input line 1 ended by \\end{Aufgabe}.\nl.5 \\FestePunkte{2}\n';
    const prompt = buildAiPrompt({ log, engine: 'local', includeSource: false, assets, locale: 'en' });
    expect(prompt).toContain('PART BEGIN');
    expect(prompt).toContain('PART END');
    expect(prompt).not.toContain('\\theTeilaufgabe');
    expect(prompt).toContain('50\\% #1');
    expect(prompt).not.toContain('UNRELATED LINE');
  });

  it('shows the code around each error of a long exercise', () => {
    const body = Array.from({ length: 300 }, (_, i) => `row ${i + 1}`);
    const doc = ['\\begin{document}', ...body].join('\n');
    const log = '! Undefined control sequence.\nl.21 row 20\n! Undefined control sequence.\nl.181 row 180\n';
    const prompt = buildAiPrompt({ log, engine: 'local', source: doc, ranges: [{ label: 'Long', start: 2, end: 301 }], includeSource: true, locale: 'en' });
    expect(prompt).toContain('error at line 20');
    expect(prompt).toContain('error at line 180');
    expect(prompt).toContain('row 180');
  });
});

describe('buildAiPrompt attached files', () => {
  const log = '! LaTeX Error: File `plot.png\' not found.\n';
  it('lists the attached files once resolved, says so when there are none, and omits the section while unknown', () => {
    const listed = buildAiPrompt({ log, engine: 'server', includeSource: false, locale: 'en', resourceNames: ['graph.png', 'data.tex'] });
    expect(listed).toContain('## Attached files');
    expect(listed).toContain('`graph.png`, `data.tex`');
    const none = buildAiPrompt({ log, engine: 'server', includeSource: false, locale: 'en', resourceNames: [] });
    expect(none).toContain('None; the exercises have no attached files.');
    const unknown = buildAiPrompt({ log, engine: 'server', includeSource: false, locale: 'en', resourceNames: null });
    expect(unknown).not.toContain('## Attached files');
  });
});
