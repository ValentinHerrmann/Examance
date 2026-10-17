import { describe, expect, it } from 'vitest';
import {
  calculateOverallScoreDistribution,
  examMaxPoints,
} from '../src/lib/analytics/overallScores';
import { applyPalette } from '../src/lib/components/stats/chartExport';

const sub = (examId: string, totalScore?: number) => ({ examId, totalScore });
/** Count per bin, keyed by the bin's lower bound (bins follow the linear-40 reference key). */
const counts = (subs: { examId: string; totalScore?: number }[], max: Record<string, number>) =>
  Object.fromEntries(
    calculateOverallScoreDistribution(subs, new Map(Object.entries(max)))
      .bins.filter((b) => b.count > 0)
      .map((b) => [b.binStart, b.count]),
  );

describe('examMaxPoints', () => {
  it('sums the exercise maxima and treats a missing one as 0', () => {
    expect(examMaxPoints([{ maxPoints: 5 }, { maxPoints: 2.5 }, { maxPoints: 0 }])).toBe(7.5);
    expect(examMaxPoints([{ maxPoints: Number.NaN }, { maxPoints: 4 }])).toBe(4);
    expect(examMaxPoints([])).toBe(0);
  });
});

describe('calculateOverallScoreDistribution', () => {
  it('has twenty ascending 5 % bins from 0 to 100, aligned to the linear-40 key (issue #89)', () => {
    const { bins } = calculateOverallScoreDistribution([], new Map());
    expect(bins).toHaveLength(20);
    expect(bins.map((b) => [b.binStart, b.binEnd])).toEqual(
      Array.from({ length: 20 }, (_, i) => [i * 5, (i + 1) * 5]),
    );
    expect(bins.every((b) => b.count === 0 && b.provisionalCount === 0)).toBe(true);
    expect(bins.filter((b) => b.startsGrade).map((b) => b.binStart)).toEqual([0, 20, 40, 55, 70, 85]);
  });

  it('colours each bin by its grade under the reference key', () => {
    const { bins } = calculateOverallScoreDistribution([], new Map());
    const colorAt = (start: number) => bins.find((b) => b.binStart === start)!.colorVar;
    expect(colorAt(85)).toBe(colorAt(95));
    expect(colorAt(80)).not.toBe(colorAt(85));
    expect(colorAt(35)).not.toBe(colorAt(40));
  });

  it('summarizes the percentages like an exam, for the mean/median/SD overlays', () => {
    expect(calculateOverallScoreDistribution([], new Map()).stats.summary).toBeNull();
    const e = calculateOverallScoreDistribution(
      [sub('a', 5), sub('b', 30)],
      new Map([['a', 10], ['b', 40]]),
    );
    expect(e.stats.summary?.mean).toBeCloseTo(62.5);
    expect(e.stats.summary?.median).toBeCloseTo(62.5);
    expect(e.stats.results).toHaveLength(2);
  });

  it('is empty when nothing is graded', () => {
    const d = calculateOverallScoreDistribution([sub('a'), sub('a')], new Map([['a', 10]]));
    expect(d).toMatchObject({ counted: 0, ungraded: 2, withoutMaxPoints: 0 });
    expect(d.bins.every((b) => b.count === 0)).toBe(true);
  });

  it('measures each submission against its own exam, so exams with different maxima mix', () => {
    // 15/20 and 7.5/10 are both 75 %; 40/40 is 100 %.
    expect(counts([sub('a', 15), sub('b', 7.5), sub('c', 40)], { a: 20, b: 10, c: 40 })).toEqual({ 75: 2, 95: 1 });
  });

  it('puts a boundary value in the higher bin and 100 % in the last one', () => {
    // 0, 10, 50, 90 and 100 %: boundaries go up, 100 % stays in the 95–100 bin.
    expect(counts([sub('a', 0), sub('a', 1), sub('a', 5), sub('a', 9), sub('a', 10)], { a: 10 })).toEqual({
      0: 1,
      10: 1,
      50: 1,
      90: 1,
      95: 1,
    });
  });

  it('is not thrown off by float noise just below a boundary', () => {
    // 8.1 / 9 * 100 is 89.99999999999999.
    expect(counts([sub('a', 8.1)], { a: 9 })).toEqual({ 90: 1 });
  });

  it('clamps bonus points and negative totals into the end bins', () => {
    expect(counts([sub('a', 12), sub('a', -3)], { a: 10 })).toEqual({ 0: 1, 95: 1 });
  });

  it('leaves out submissions without a total score and says how many', () => {
    const d = calculateOverallScoreDistribution(
      [sub('a', 5), sub('a'), sub('a', Number.NaN)],
      new Map([['a', 10]]),
    );
    expect(d).toMatchObject({ counted: 1, ungraded: 2, withoutMaxPoints: 0 });
    expect(d.bins.find((b) => b.binStart === 50)!.count).toBe(1);
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
