import { describe, it, expect } from 'vitest';
import {
  appendPart,
  parseExerciseStructure,
  setCompetencies,
  setFixedScore,
  setRequirementLevel
} from '../src/lib/latex/exerciseStructure';
import { parseExerciseScore } from '../src/lib/latex/scoreParser';

const PARTS = `\\begin{Aufgabe}{Teile}
\\AFB{II}
Einleitung. % \\BE in a comment does not count
\\begin{Teilaufgabe}{Erster Teil}
\\AFB{I}
Text \\BE \\BE \\hBE
\\end{Teilaufgabe}
\\begin{Teilaufgabe}[4]{Zweiter}
Text \\BE
\\end{Teilaufgabe}
\\begin{Teilaufgabe}{Dritter}
\\FestePunkte{3}
Text \\BE
\\end{Teilaufgabe}
\\end{Aufgabe}`;

describe('parseExerciseStructure', () => {
  it('reads parts, their fixed scores and requirement levels', () => {
    const s = parseExerciseStructure(PARTS);
    expect(s.parts.map((p) => [p.label, p.title, p.score, p.fixed])).toEqual([
      ['a', 'Erster Teil', 2.5, null],
      ['b', 'Zweiter', 4, 4],
      ['c', 'Dritter', 3, 3]
    ]);
    expect(s.parts[0].levels).toEqual(['I']);
    expect(s.levels).toEqual(['II']);
    // Fixed part scores replace their units in the total, as Schulaufgabe.sty does.
    expect(s.score).toBe(9.5);
    expect(parseExerciseScore(PARTS)).toBe(9.5);
  });

  it('lets \\FestePunkte outside the parts fix the exercise score', () => {
    expect(parseExerciseScore('\\FestePunkte{7}\nText \\BE')).toBe(7);
  });
});

describe('structure editing helpers', () => {
  it('round-trips level, competencies and fixed scores without touching other content', () => {
    let x = setRequirementLevel(PARTS, 'III');
    x = setCompetencies(x, ['Modellieren', 'Argumentieren']);
    x = setFixedScore(x, 12);
    x = setRequirementLevel(x, 'II', 1);
    x = setFixedScore(x, null, 1);
    const s = parseExerciseStructure(x);
    expect(s.levels).toEqual(['III']);
    expect(s.competencies.sort()).toEqual(['Argumentieren', 'Modellieren']);
    expect(s.score).toBe(12);
    expect(s.parts[1].levels).toEqual(['II']);
    expect(s.parts[1].fixed).toBeNull();
    expect(x).not.toContain('\\begin{Teilaufgabe}[');

    x = setFixedScore(setCompetencies(setRequirementLevel(x, null), []), null);
    const cleared = parseExerciseStructure(x);
    expect(cleared.levels).toEqual([]);
    expect(cleared.competencies).toEqual([]);
    expect(cleared.fixed).toBeNull();
  });

  it('updates an existing \\begin{Aufgabe}[N] option instead of adding a second fixed score', () => {
    const src = '\\begin{Aufgabe}[5]{O}\nA \\BE\n\\end{Aufgabe}';
    expect(setFixedScore(src, 8)).toBe('\\begin{Aufgabe}[8]{O}\nA \\BE\n\\end{Aufgabe}');
    expect(setFixedScore(src, null)).toBe('\\begin{Aufgabe}{O}\nA \\BE\n\\end{Aufgabe}');
  });

  it('appends a part before \\end{Aufgabe}', () => {
    const x = appendPart('\\begin{Aufgabe}{A}\nIntro\n\\end{Aufgabe}', 'Neu');
    expect(x).toBe('\\begin{Aufgabe}{A}\nIntro\n\\begin{Teilaufgabe}{Neu}\n\n\\end{Teilaufgabe}\n\\end{Aufgabe}');
    expect(parseExerciseStructure(x).parts).toHaveLength(1);
  });
});
