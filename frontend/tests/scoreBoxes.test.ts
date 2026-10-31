import { describe, expect, it, vi } from 'vitest';

// Only the pure value builder is under test; the template loader's DB/API imports are stubbed.
vi.mock('../src/lib/grading/omrTemplatePrep', () => ({
  OMR_TEMPLATE_VERSION: 2,
  computeOmrTemplateHash: vi.fn(),
  loadExamCompileContext: vi.fn(),
}));
vi.mock('../src/lib/db/dbEncryption', () => ({ loadOmrTemplateEncrypted: vi.fn() }));

import { buildScoreBoxValues } from '../src/lib/grading/scoreBoxes';

const exercises = [
  { id: 'ex-1', maxPoints: 6 },
  { id: 'mc-a', maxPoints: 1 },
  { id: 'mc-b', maxPoints: 1 },
];
const positions = { 1: ['ex-1'], 2: ['mc-a', 'mc-b'] };
const gradingKey = {
  cutoffs: [
    { grade: '1', label: 'sehr gut', minPercentage: 85 },
    { grade: '2', label: 'gut', minPercentage: 70 },
    { grade: '6', label: 'ungenügend', minPercentage: 0 },
  ],
} as any;

describe('buildScoreBoxValues', () => {
  it('fills an MC group box only when every member is graded', () => {
    const values = buildScoreBoxValues({ positions, exercises, scoreInputs: { 'ex-1': 4, 'mc-a': 1 }, partInputs: {} });
    expect(values.get('task/1')).toBe('4');
    expect(values.get('cell/1')).toBe('4');
    expect(values.has('task/2')).toBe(false);
    expect(values.has('sum')).toBe(false);
    expect(values.has('grade')).toBe(false);
  });

  it('fills Σ and the grade once everything is graded, with comma decimals', () => {
    const values = buildScoreBoxValues({
      positions,
      exercises,
      scoreInputs: { 'ex-1': 5.5, 'mc-a': 1, 'mc-b': 0.5 },
      partInputs: {},
      gradingKey,
    });
    expect(values.get('task/2')).toBe('1,5');
    expect(values.get('sum')).toBe('7');
    expect(values.get('grade')).toBe('1');
  });

  it('leaves the grade empty without a grading key', () => {
    const values = buildScoreBoxValues({ positions, exercises, scoreInputs: { 'ex-1': 1, 'mc-a': 0, 'mc-b': 0 }, partInputs: {} });
    expect(values.get('sum')).toBe('1');
    expect(values.has('grade')).toBe(false);
  });

  it('fills part boxes from the part scores', () => {
    const values = buildScoreBoxValues({
      positions,
      exercises,
      scoreInputs: { 'ex-1': 3 },
      partInputs: { 'ex-1': { a: 1, b: 2, c: null } },
    });
    expect(values.get('part/1/a')).toBe('1');
    expect(values.get('part/1/b')).toBe('2');
    expect(values.has('part/1/c')).toBe(false);
  });
});
