import { describe, it, expect, vi } from 'vitest';
import { buildMcOptionsLatex, parseMcOptions, printedMcOptions } from '../src/lib/latex/mcOptions';
import { escapeLatex, unescapeLatex } from '../src/lib/latex/scoreParser';
import { normalizeMcExercise } from '../src/lib/grading/mcExerciseHash';
import type { ExerciseRecord } from '../src/lib/db/schema';

// normalizeMcExercise is pure; keep the module's DB loaders out of the test.
vi.mock('../src/lib/db/dbEncryption', () => ({
  loadExamExercisesEncrypted: vi.fn(),
  loadExercisesEncrypted: vi.fn(),
  loadLocalMcGroups: vi.fn(),
}));

const THREE_OPTIONS = `b) Was ist richtig?

\\LoesungMulti[3]{
  \\Lmulti{richtig}
  \\multi{falsch}
  \\Lmulti{auch richtig}
}`;

describe('parseMcOptions', () => {
  it('reads every option in printed order, independent of the column count', () => {
    const one = parseMcOptions(THREE_OPTIONS.replace('[3]', '[1]'));
    expect(one.options).toEqual([
      { text: 'richtig', correct: true },
      { text: 'falsch', correct: false },
      { text: 'auch richtig', correct: true },
    ]);
    expect(one.columns).toBe(1);
    expect(parseMcOptions(THREE_OPTIONS.replace('[3]', '[2]')).options).toHaveLength(3);
    expect(parseMcOptions(THREE_OPTIONS).columns).toBeNull();
  });

  it('accepts \\LoesungMulti without a column count (Loesung.sty defaults to 2)', () => {
    const parsed = parseMcOptions('Frage\n\\LoesungMulti{\\multi{a}\\Lmulti{b}\\multi{c}}');
    expect(parsed.options.map((o) => o.text)).toEqual(['a', 'b', 'c']);
    expect(parsed.columns).toBe(2);
    expect(parsed.questionText).toBe('Frage');
  });

  it('keeps nested braces inside an option and unescapes its text', () => {
    const parsed = parseMcOptions('\\LoesungMulti[2]{\\Lmulti{\\textbf{fett} 50\\%}\\multi{a\\_b}}');
    expect(parsed.options).toEqual([
      { text: '\\textbf{fett} 50%', correct: true },
      { text: 'a_b', correct: false },
    ]);
  });

  it('round-trips text written by buildMcOptionsLatex', () => {
    const options = [
      { text: '50% & mehr', correct: true },
      { text: 'C:\\temp {x}', correct: false },
    ];
    expect(parseMcOptions(buildMcOptionsLatex('Frage', options)).options).toEqual(options);
  });

  it('returns no options without a \\LoesungMulti block', () => {
    expect(parseMcOptions('Freitext').options).toEqual([]);
  });
});

describe('printedMcOptions', () => {
  it('counts every box of the body, including one outside \\LoesungMulti', () => {
    const body = '\\begin{description}\\multi{a}\\Lmulti{b}\\end{description}';
    expect(printedMcOptions(body).map((o) => o.text)).toEqual(['a', 'b']);
  });

  it('ignores commented-out options and other control words', () => {
    const body = `\\begin{multicols}{2}\\LoesungMulti[2]{
  \\multi{a}
  % \\Lmulti{entfernt}
  \\Lmulti{b} % Kommentar
  \\multi{100\\% sicher}
}\\end{multicols}`;
    expect(printedMcOptions(body)).toEqual([
      { text: 'a', correct: false },
      { text: 'b', correct: true },
      { text: '100% sicher', correct: false },
    ]);
  });

  it('reads options written without braces up to the next option or the group end', () => {
    const body = '\\LoesungMulti[2]{\\multi erste Antwort \\Lmulti zweite}\n\\end{Aufgabe}';
    expect(printedMcOptions(body)).toEqual([
      { text: 'erste Antwort', correct: false },
      { text: 'zweite', correct: true },
    ]);
  });

  it('treats a brace group after \\multi as part of the item text, not as its argument', () => {
    const body = '\\LoesungMulti[2]{\n  \\multi{} Ja\n  \\Lmulti{A} (2 P.)\n  \\multi{\\textbf{x}} y\n}';
    expect(printedMcOptions(body)).toEqual([
      { text: 'Ja', correct: false },
      { text: 'A (2 P.)', correct: true },
      { text: '\\textbf{x} y', correct: false },
    ]);
  });

  it('keeps an environment inside an unbraced option', () => {
    const body = '\\multi $\\begin{pmatrix}1\\end{pmatrix}$ \\Lmulti zwei\n\\end{description}';
    expect(printedMcOptions(body).map((o) => o.text)).toEqual(['$\\begin{pmatrix}1\\end{pmatrix}$', 'zwei']);
  });

  it('is empty for missing or empty bodies', () => {
    expect(printedMcOptions(undefined)).toEqual([]);
    expect(printedMcOptions('')).toEqual([]);
  });
});

describe('unescapeLatex', () => {
  it('inverts escapeLatex in one pass', () => {
    const text = '\\% 50% a_b {x} ~ ^ $ # &';
    expect(unescapeLatex(escapeLatex(text))).toBe(text);
  });
});

describe('normalizeMcExercise', () => {
  const base: ExerciseRecord = {
    id: 'ex-1',
    title: 'Vie Auswahl',
    latexBody: THREE_OPTIONS,
    maxPoints: 2,
    penalty: 1,
    questionType: 'mc',
    // Stale stored copy, e.g. inherited by a new variant from its base exercise.
    options: ['richtig', 'falsch'],
    correctAnswers: { options: ['richtig', 'falsch'], correct: [0] } as unknown as number[],
  };

  it('takes options and answer key from the printed LaTeX over a stale stored copy', () => {
    const normalized = normalizeMcExercise(base);
    expect(normalized.options).toEqual(['richtig', 'falsch', 'auch richtig']);
    expect(normalized.correctAnswers).toEqual([0, 2]);
  });

  it('falls back to the stored answer key when the LaTeX has no options', () => {
    const normalized = normalizeMcExercise({ ...base, latexBody: '' });
    expect(normalized.options).toEqual(['richtig', 'falsch']);
    expect(normalized.correctAnswers).toEqual([0]);
  });

  it('leaves free-text exercises alone', () => {
    const freeText: ExerciseRecord = { ...base, questionType: 'free_text' };
    expect(normalizeMcExercise(freeText)).toBe(freeText);
  });
});
