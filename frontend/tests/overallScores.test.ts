import { describe, expect, it } from 'vitest';
import {
  calculateOverallScoreDistribution,
  examMaxPoints,
} from '../src/lib/analytics/overallScores';
import { applyPalette } from '../src/lib/components/stats/chartExport';

const sub = (examId: string, totalScore?: number) => ({ examId, totalScore });
const counts = (subs: { examId: string; totalScore?: number }[], max: Record<string, number>) =>
  calculateOverallScoreDistribution(subs, new Map(Object.entries(max))).bins.map((b) => b.count);

describe('examMaxPoints', () => {
  it('sums the exercise maxima and treats a missing one as 0', () => {
    expect(examMaxPoints([{ maxPoints: 5 }, { maxPoints: 2.5 }, { maxPoints: 0 }])).toBe(7.5);
    expect(examMaxPoints([{ maxPoints: Number.NaN }, { maxPoints: 4 }])).toBe(4);
    expect(examMaxPoints([])).toBe(0);
  });
});

describe('calculateOverallScoreDistribution', () => {
  it('has ten ascending 10 % bins from 0 to 100', () => {
    const { bins } = calculateOverallScoreDistribution([], new Map());
    expect(bins).toHaveLength(10);
    expect(bins.map((b) => [b.binStart, b.binEnd])).toEqual(
      Array.from({ length: 10 }, (_, i) => [i * 10, (i + 1) * 10]),
    );
    expect(bins.every((b) => b.count === 0 && b.provisionalCount === 0)).toBe(true);
  });

  it('is empty when nothing is graded', () => {
    const d = calculateOverallScoreDistribution([sub('a'), sub('a')], new Map([['a', 10]]));
    expect(d).toMatchObject({ counted: 0, ungraded: 2, withoutMaxPoints: 0 });
    expect(d.bins.every((b) => b.count === 0)).toBe(true);
  });

  it('measures each submission against its own exam, so exams with different maxima mix', () => {
    // 15/20 and 7.5/10 are both 75 %; 40/40 is 100 %.
    const result = counts([sub('a', 15), sub('b', 7.5), sub('c', 40)], { a: 20, b: 10, c: 40 });
    expect(result[7]).toBe(2);
    expect(result[9]).toBe(1);
    expect(result.reduce((x, y) => x + y, 0)).toBe(3);
  });

  it('puts a boundary value in the higher bin and 100 % in the last one', () => {
    const result = counts([sub('a', 0), sub('a', 1), sub('a', 5), sub('a', 9), sub('a', 10)], { a: 10 });
    expect(result).toEqual([1, 1, 0, 0, 0, 1, 0, 0, 0, 2]);
  });

  it('is not thrown off by float noise just below a boundary', () => {
    // 8.1 / 9 * 100 is 89.99999999999999.
    expect(counts([sub('a', 8.1)], { a: 9 })[9]).toBe(1);
  });

  it('clamps bonus points and negative totals into the end bins', () => {
    const result = counts([sub('a', 12), sub('a', -3)], { a: 10 });
    expect(result[9]).toBe(1);
    expect(result[0]).toBe(1);
  });

  it('leaves out submissions without a total score and says how many', () => {
    const d = calculateOverallScoreDistribution(
      [sub('a', 5), sub('a'), sub('a', Number.NaN)],
      new Map([['a', 10]]),
    );
    expect(d).toMatchObject({ counted: 1, ungraded: 2, withoutMaxPoints: 0 });
    expect(d.bins[5].count).toBe(1);
  });

  it('leaves out graded submissions whose exam has no known or a zero maximum', () => {
    const d = calculateOverallScoreDistribution(
      [sub('a', 5), sub('unknown', 5), sub('zero', 0)],
      new Map([
        ['a', 10],
        ['zero', 0],
      ]),
    );
    expect(d).toMatchObject({ counted: 1, ungraded: 0, withoutMaxPoints: 2 });
  });

  it('accounts for every submission it is given', () => {
    const d = calculateOverallScoreDistribution(
      [sub('a', 1), sub('a'), sub('x', 3)],
      new Map([['a', 10]]),
    );
    expect(d.counted + d.ungraded + d.withoutMaxPoints).toBe(3);
    expect(d.bins.reduce((n, b) => n + b.count, 0)).toBe(d.counted);
  });

  it('colours its bars with a token the chart export knows', () => {
    const { bins } = calculateOverallScoreDistribution([], new Map());
    expect(() => applyPalette(`<path fill="${bins[0].colorVar}"/>`)).not.toThrow();
  });
});
