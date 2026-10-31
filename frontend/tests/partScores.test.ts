import { describe, expect, it } from 'vitest';
import { recalculateAutoScores } from '../src/lib/grading/autoScore';
import type { VectorStroke } from '../src/lib/grading/gradingStore';
import { exerciseParts, partOverrideKey, reconcileParts, sumParts } from '../src/lib/grading/partScores';
import type { ExerciseRecord } from '../src/lib/db/schema';

const body = String.raw`\begin{Teilaufgabe}{Eins}\BE\BE\end{Teilaufgabe}
\begin{Teilaufgabe}{Zwei}\BE\BE\BE\end{Teilaufgabe}`;
const ex = { id: 'ex-1', maxPoints: 5, latexBody: body } as ExerciseRecord;
const stamp = (tool: VectorStroke['tool'], partLabel?: string): VectorStroke => ({
  tool,
  points: [{ x: 0, y: 0 }],
  color: '#ef4444',
  exerciseId: 'ex-1',
  partLabel,
});

describe('part scores (issue #187)', () => {
  it('reads parts and their maxima from the LaTeX', () => {
    expect(exerciseParts(ex)).toEqual([
      { label: 'a', max: 2 },
      { label: 'b', max: 3 },
    ]);
    expect(exerciseParts({ questionType: 'mc', latexBody: body })).toEqual([]);
  });

  it('sums graded parts and keeps them only while they match the total', () => {
    expect(sumParts({ a: 1.5, b: null })).toBe(1.5);
    expect(sumParts({ a: null })).toBeNull();
    expect(reconcileParts(3, { a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(reconcileParts(4, { a: 1, b: 2 })).toBeUndefined();
  });

  it('scores stamps per part, clamped to the part maximum', () => {
    const strokes = [stamp('check_full', 'a'), stamp('check_full', 'a'), stamp('check_full', 'a'), stamp('check_half', 'b')];
    const res = recalculateAutoScores([ex], strokes, {}, {});
    expect(res.partInputs['ex-1']).toEqual({ a: 2, b: 0.5 });
    expect(res.scoreInputs['ex-1']).toBe(2.5);
  });

  it('keeps a typed part and still counts the stamped one', () => {
    const res = recalculateAutoScores([ex], [stamp('check_full', 'b')], {}, { [partOverrideKey('ex-1', 'a')]: true }, {
      'ex-1': { a: 1.5 },
    });
    expect(res.partInputs['ex-1']).toEqual({ a: 1.5, b: 1 });
    expect(res.scoreInputs['ex-1']).toBe(2.5);
  });

  it('scores stamps without a part (older annotations) on the whole exercise', () => {
    const res = recalculateAutoScores([ex], [stamp('check_full'), stamp('check_full')], {}, {});
    expect(res.scoreInputs['ex-1']).toBe(2);
    expect(res.partInputs['ex-1']).toBeUndefined();
  });
});
