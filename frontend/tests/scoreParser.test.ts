import { describe, it, expect } from 'vitest';
import { parseExerciseScore, formatExerciseLatex, formatMcGroupLatex, MC_CORRECTION_HINT } from '../src/lib/latex/scoreParser';
import { buildExerciseInputs } from '../src/lib/exam/examPreview';
import type { ExerciseRecord } from '../src/lib/db/schema';
import type { ExamItemRef } from '../src/lib/grading/omrTemplatePrep';

describe('LaTeX Score Parser (parseExerciseScore)', () => {
  it('parses \\Lmulti tags as 1.0 point each', () => {
    const latex = `
\\begin{Aufgabe}{Grundlagen}
Wie oft wird der Inhalt einer For-Schleife mit dem folgenden Kopf durchlaufen?
\\emph{for(int i = 1; i < 10; i += 2)}

\\LoesungMulti[4]{
  \\Lmulti{5}
  \\multi{9}
  \\multi{10}
  \\multi{4}
}
\\end{Aufgabe}
    `;
    expect(parseExerciseScore(latex)).toBe(1.0);
  });

  it('parses multiple \\Lmulti tags', () => {
    const latex = `
\\begin{Aufgabe}{MC Multiple}
Wähle alle richtigen Aussagen:
\\LoesungMulti[2]{
  \\Lmulti{Option A}
  \\Lmulti{Option B}
  \\multi{Option C}
}
\\end{Aufgabe}
    `;
    expect(parseExerciseScore(latex)).toBe(2.0);
  });

  it('parses \\BE, \\hBE, and \\qBE tags', () => {
    const latex = `
\\begin{Aufgabe}{Punkte}
Teil A \\BE
Teil B \\hBE
Teil C \\qBE
\\end{Aufgabe}
    `;
    expect(parseExerciseScore(latex)).toBe(1.75);
  });

  it('respects manual score override \\begin{Aufgabe}[N]', () => {
    const latex = `
\\begin{Aufgabe}[5]{Overridden Score}
Teil A \\BE
\\end{Aufgabe}
    `;
    expect(parseExerciseScore(latex)).toBe(5);
  });

  it('returns 0 for empty or tagless latex', () => {
    expect(parseExerciseScore('')).toBe(0);
    expect(parseExerciseScore('Just text without score tags')).toBe(0);
  });
});

describe('formatExerciseLatex', () => {
  it('wraps un-wrapped latex in \\begin{Aufgabe} ... \\end{Aufgabe}', () => {
    const result = formatExerciseLatex('Berechne 2+2.', 'Test');
    expect(result).toContain('\\begin{Aufgabe}{Test}');
    expect(result).toContain('\\end{Aufgabe}');
  });

  it('injects \\OmrExercise when exerciseId is provided', () => {
    const result = formatExerciseLatex('Berechne 2+2.', 'Test', 'ex-123');
    expect(result).toContain('\\OmrExercise{ex-123}');
    expect(result).toContain('\\begin{Aufgabe}{Test}');
    expect(result).toContain('Berechne 2+2.');
    expect(result).toContain('\\end{Aufgabe}');
  });

  it('preserves existing \\begin{Aufgabe} ... \\end{Aufgabe} structure', () => {
    const customBody = `\\begin{Aufgabe}[12] Klassendiagramm\nInhalt\n\\end{Aufgabe}\n\\newcommand{\\LsgDiagramm}{...}\n\\LoesungKaro{\\LsgDiagramm}{40}`;
    const result = formatExerciseLatex(customBody, 'Klassendiagramm', 'ex-456');
    expect(result).toContain('\\OmrExercise{ex-456}');
    expect(result).toContain('\\begin{Aufgabe}[12] Klassendiagramm');
    expect(result).toContain('\\LoesungKaro{\\LsgDiagramm}{40}');
    // Should not add redundant outer \begin{Aufgabe} or \end{Aufgabe}
    expect(result.split('\\begin{Aufgabe}').length - 1).toBe(1);
    expect(result.split('\\end{Aufgabe}').length - 1).toBe(1);
  });
});

describe('MC correction legend (issue #192)', () => {
  const mc = '\\LoesungMulti{\n  \\multi{A}\n  \\Lmulti{B}\n}';

  it('is printed after the title of an MC exercise, before its OMR id', () => {
    const result = formatExerciseLatex(mc, 'MC', 'ex-1', undefined, true);
    expect(result).toContain(`\\begin{Aufgabe}{MC}\n${MC_CORRECTION_HINT}\\OmrExercise{ex-1}`);
  });

  it('is skipped when off or when the body opens its own Aufgabe', () => {
    expect(formatExerciseLatex(mc, 'MC', 'ex-1')).not.toContain('McKorrekturHinweis');
    const own = `\\begin{Aufgabe}{X}\n${mc}\n\\end{Aufgabe}`;
    expect(formatExerciseLatex(own, 'X', 'ex-1', undefined, true)).not.toContain('McKorrekturHinweis');
  });

  it('is printed once under an MC group instruction', () => {
    const members = [{ id: 'a', latexBody: mc }, { id: 'b', latexBody: mc }];
    expect(formatMcGroupLatex(members, 'G', 'S', true).split('McKorrekturHinweis').length - 1).toBe(1);
    expect(formatMcGroupLatex(members, 'G', 'S')).not.toContain('McKorrekturHinweis');
  });

  it('goes only to exercises with answer boxes', () => {
    const exercises = [
      { id: 'mc', name: 'MC', latexBody: mc },
      { id: 'ft', name: 'Text', latexBody: 'Erkläre.' },
    ] as ExerciseRecord[];
    const items = [{ type: 'exercise', id: 'mc' }, { type: 'exercise', id: 'ft' }] as ExamItemRef[];
    const tex = buildExerciseInputs(items, exercises, [], [], null, true);
    expect(tex.split('McKorrekturHinweis').length - 1).toBe(1);
    expect(buildExerciseInputs(items, exercises, [], [], null)).not.toContain('McKorrekturHinweis');
  });
});
