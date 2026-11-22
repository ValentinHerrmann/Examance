import { describe, expect, it } from 'vitest';
import type { ExerciseRecord } from '../src/lib/db/schema';
import { gradingTargets, stepTarget, targetIndex, targetInputId } from '../src/lib/grading/gradingTargets';
import { REST_KEY } from '../src/lib/grading/partScores';

const parts = String.raw`\begin{Teilaufgabe}{Eins}\BE\BE\end{Teilaufgabe}
\begin{Teilaufgabe}{Zwei}\BE\BE\BE\end{Teilaufgabe}`;
const ex = (id: string, maxPoints: number, latexBody = ''): ExerciseRecord => ({ id, maxPoints, latexBody, orderIndex: 1 }) as unknown as ExerciseRecord;

const plain = ex('one', 4);
const split = ex('two', 5, parts);
const withRest = ex('three', 7, parts);

describe('grading targets (issue #330)', () => {
  it('walks parts and skips the totals of exercises with parts', () => {
    const order = gradingTargets([plain, split, withRest]).map((t) => [t.exercise.id, t.partKey, t.max]);
    expect(order).toEqual([
      ['one', null, 4],
      ['two', 'a', 2],
      ['two', 'b', 3],
      ['three', 'a', 2],
      ['three', 'b', 3],
      ['three', REST_KEY, 2],
    ]);
  });

  it('finds the active target, an active total maps to the rest or the first part', () => {
    const targets = gradingTargets([plain, split, withRest]);
    expect(targetIndex(targets, 'two', 'b')).toBe(2);
    expect(targetIndex(targets, 'two', '')).toBe(1);
    expect(targetIndex(targets, 'three', '')).toBe(5);
    expect(targetIndex(targets, 'gone', '')).toBe(-1);
  });

  it('reports leaving the list at either end', () => {
    const targets = gradingTargets([plain, split]);
    expect(stepTarget(targets, 0, -1)).toEqual({ kind: 'before' });
    expect(stepTarget(targets, 0, 1)).toEqual({ kind: 'target', index: 1 });
    expect(stepTarget(targets, 2, 1)).toEqual({ kind: 'after' });
    expect(stepTarget(targets, -1, 1)).toEqual({ kind: 'target', index: 0 });
    expect(stepTarget(targets, -1, -1)).toEqual({ kind: 'before' });
    expect(stepTarget([], 0, 1)).toEqual({ kind: 'after' });
  });

  it('names the score fields of the list', () => {
    const [whole, partA] = gradingTargets([plain, split]);
    expect(targetInputId(whole)).toBe('score-one');
    expect(targetInputId(partA)).toBe('score-two-a');
  });
});
