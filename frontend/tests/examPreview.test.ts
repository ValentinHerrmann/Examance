import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/latex/compileCache', () => ({
  compileWithCache: vi.fn(),
  getCachedFor: vi.fn(),
  getLatestForSlot: vi.fn(),
}));
vi.mock('../src/lib/repositories/exerciseResourceRepository', () => ({ exerciseResourceRepository: {} }));
vi.mock('../src/lib/latex/packageSettings', () => ({ getAccountPackages: vi.fn().mockResolvedValue([]) }));

import { buildExamLatex, buildExerciseBlocks } from '../src/lib/exam/examPreview';
import { mapScorePositions } from '../src/lib/grading/omrTemplatePrep';
import type { ExamRecord } from '../src/lib/db/schema';

const base = { id: 'e1', teacherId: 't', retentionUntil: '2030-01-01', compilationStatus: 'pending', createdAt: '' } as ExamRecord;

describe('buildExamLatex extra notes', () => {
  it('ends the body with \\ExamNotes, after the exercises', () => {
    const exam = { ...base, extraNotes: { title: 'Platz & mehr_', description: 'Hinweis', minHeightCm: 4, maxHeightCm: 12 } };
    const tex = buildExamLatex(exam, '\\Aufgabe{X}', 'sans,punkte', []);
    const macro = '\\ExamNotes{Platz \\& mehr\\_}{Hinweis}{4}{12}';
    expect(tex).toContain(macro);
    expect(tex.indexOf(macro)).toBeGreaterThan(tex.indexOf('\\Aufgabe{X}'));
    expect(tex.slice(tex.indexOf(macro) + macro.length).trim()).toBe('\\end{document}');
  });

  it('omits it when off', () => {
    expect(buildExamLatex({ ...base, extraNotes: null }, '', 'sans', [])).not.toContain('\\ExamNotes');
    expect(buildExamLatex(base, '', 'sans', [])).not.toContain('\\ExamNotes');
  });
});

describe('score box positions (issue #187)', () => {
  const exercises = [
    { id: 'ex-1', name: 'Eins', latexBody: 'x', maxPoints: 1 },
    { id: 'mc-a', name: 'A', latexBody: '\\multi a', maxPoints: 1 },
    { id: 'mc-b', name: 'B', latexBody: '\\multi b', maxPoints: 1 },
  ] as any[];
  const groups = [{ id: 'g-1', title: 'MC', scoringText: '', memberIds: ['mc-a', 'mc-b'] }] as any[];
  const items = [
    { type: 'exercise' as const, id: 'ex-1' },
    { type: 'mc_group' as const, id: 'g-1' },
  ];

  it('gives one block per Aufgabe, an MC group carrying all its members', () => {
    expect(buildExerciseBlocks(items, exercises, [], groups).map((b) => b.exerciseIds)).toEqual([['ex-1'], ['mc-a', 'mc-b']]);
  });

  it('maps positions only when the captured exercise boxes match the blocks', () => {
    const page = (positions: number[]) => ({
      pageIndex: 0,
      pageWidthPt: 595,
      pageHeightPt: 842,
      fiducials: [],
      bubbles: [],
      scoreBoxes: positions.map((position) => ({ box: 'task' as const, position, rect: [0, 0, 1, 1] as [number, number, number, number] })),
    });
    const ids = [['ex-1'], ['mc-a', 'mc-b']];
    expect(mapScorePositions(ids, [page([1, 2])])).toEqual({ 1: ['ex-1'], 2: ['mc-a', 'mc-b'] });
    expect(mapScorePositions(ids, [page([1, 2, 3])])).toEqual({});
    expect(mapScorePositions(ids, [page([])])).toEqual({});
  });
});
