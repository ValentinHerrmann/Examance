import { describe, it, expect } from 'vitest';
import {
  calculateSubmissionPercentage,
  calculatePercentageHistogram,
} from '../src/lib/analytics/stats';
import {
  calculateGradeDistribution,
  calculateGradeFromPercentage,
  calculateClassGradeAverage,
  calculatePassRate,
  effectiveGradingKey,
  DEFAULT_CUTOFFS_LINEAR_50,
} from '../src/lib/analytics/gradingKey';
import type { GradingKeyConfig } from '../src/lib/db/schema';

const linear50: GradingKeyConfig = {
  preset: 'linear_50',
  cutoffs: DEFAULT_CUTOFFS_LINEAR_50,
};

describe('calculateSubmissionPercentage', () => {
  it('reports a partially graded submission as provisional', () => {
    const entry = calculateSubmissionPercentage([5, 3, 10, 15], [4, 1, null, null]);
    expect(entry).not.toBeNull();
    // 5/8 over the exercises graded so far.
    expect(entry?.percentage).toBeCloseTo(62.5);
    expect(entry?.isComplete).toBe(false);
    expect(entry?.gradedCount).toBe(2);
    expect(entry?.gradedPoints).toBe(5);
    expect(entry?.gradedMaxPoints).toBe(8);
  });

  it('marks a submission complete once every exercise has a score', () => {
    const entry = calculateSubmissionPercentage([5, 5], [5, 4]);
    expect(entry?.isComplete).toBe(true);
    expect(entry?.percentage).toBe(90);
  });

  it('clamps a bonus exercise above 100 instead of reporting 130%', () => {
    // maxPoints 0 adds to the numerator but not the denominator.
    const entry = calculateSubmissionPercentage([10, 0], [10, 3]);
    expect(entry?.percentage).toBe(100);
  });

  it('clamps a negative MC penalty to 0 rather than below it', () => {
    const entry = calculateSubmissionPercentage([10], [-4]);
    expect(entry?.percentage).toBe(0);
  });

  it('returns null when nothing is graded, and when the max is zero', () => {
    expect(calculateSubmissionPercentage([5, 5], [null, null])).toBeNull();
    expect(calculateSubmissionPercentage([0], [3])).toBeNull();
  });
});

describe('calculatePercentageHistogram', () => {
  it('always returns all twenty 5%-wide bins, including the empty ones', () => {
    const bins = calculatePercentageHistogram([2, 95]);
    expect(bins).toHaveLength(20);
    expect(bins[0].count).toBe(1);
    expect(bins[19].count).toBe(1);
    expect(bins.filter((b) => b.count > 0)).toHaveLength(2);
  });

  it('puts 100% in the top bin rather than a twenty-first', () => {
    const bins = calculatePercentageHistogram([100]);
    expect(bins[19].count).toBe(1);
  });

  it('tracks provisional results separately from the total', () => {
    const bins = calculatePercentageHistogram([95, 95], [true, false]);
    expect(bins[19].count).toBe(2);
    expect(bins[19].provisionalCount).toBe(1);
  });

  it('colours a bin by the grade of its lower bound', () => {
    // linear_50: grade 1 starts at 87.5%. The 85-90 bin's lower bound (85) is still grade 2.
    const bins = calculatePercentageHistogram([0], [], 5, linear50);
    expect(bins[17]).toMatchObject({ binStart: 85, binEnd: 90 });
    expect(bins[17].colorVar).toBe('var(--color-grade-2)');
    expect(bins[18]).toMatchObject({ binStart: 90, binEnd: 95 });
    expect(bins[18].colorVar).toBe('var(--color-grade-1)');
  });

  it('supports a custom bin width', () => {
    const bins = calculatePercentageHistogram([25], [], 10);
    expect(bins).toHaveLength(10);
    expect(bins[2].count).toBe(1);
  });
});

describe('calculateGradeDistribution', () => {
  it('returns all six grades even when only one occurred', () => {
    const buckets = calculateGradeDistribution([95], linear50);
    expect(buckets).toHaveLength(6);
    expect(buckets.map((b) => b.grade)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(buckets[0].count).toBe(1);
    expect(buckets.slice(1).every((b) => b.count === 0)).toBe(true);
  });

  it('falls back to a default key when the exam has none configured', () => {
    // This used to return [], which is why those exams drew an empty chart.
    const buckets = calculateGradeDistribution([95, 40], undefined);
    expect(buckets).toHaveLength(6);
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(2);
  });

  it('does not merge two brackets that share a grade label', () => {
    const twoThrees: GradingKeyConfig = {
      preset: 'custom',
      cutoffs: [
        { grade: '3', label: 'Upper 3', minPercentage: 60 },
        { grade: '3', label: 'Lower 3', minPercentage: 50 },
      ],
    };
    const buckets = calculateGradeDistribution([65, 55], twoThrees);
    expect(buckets.map((b) => b.count)).toEqual([1, 1]);
  });

  it('counts provisional results into their bucket and flags them', () => {
    const buckets = calculateGradeDistribution([95, 95], linear50, [true, false]);
    expect(buckets[0].count).toBe(2);
    expect(buckets[0].provisionalCount).toBe(1);
  });
});

describe('grade boundaries', () => {
  it('does not demote a pupil sitting exactly on a cutoff', () => {
    // 35/40 is 87.5 exactly in decimal and 87.49999999999999 in binary float.
    const percentage = (35 / 40) * 100;
    expect(calculateGradeFromPercentage(percentage, linear50)?.grade).toBe('1');
  });

  it('still grades just below a cutoff as the lower grade', () => {
    expect(calculateGradeFromPercentage(87.49, linear50)?.grade).toBe('2');
  });

  it('grades 0% as the worst grade rather than returning null', () => {
    expect(calculateGradeFromPercentage(0, linear50)?.grade).toBe('6');
  });
});

describe('class figures', () => {
  it('averages grades, not percentages', () => {
    // Three 1s and three 5s -> 3.0, which is what a Notenspiegel reports.
    const percentages = [100, 100, 100, 30, 30, 30];
    expect(calculateClassGradeAverage(percentages, linear50)).toBe(3);
  });

  it('returns null with nothing to average', () => {
    expect(calculateClassGradeAverage([], linear50)).toBeNull();
  });

  it('counts grade 4 and better as passing', () => {
    // 50% is exactly the grade-4 cutoff in linear_50.
    expect(calculatePassRate([100, 50, 49], linear50)).toBeCloseTo(2 / 3);
    expect(calculatePassRate([], linear50)).toBeNull();
  });

  it('has no pass mark for a key without numeric grades', () => {
    const letters: GradingKeyConfig = {
      preset: 'custom',
      cutoffs: [
        { grade: 'A', label: 'A', minPercentage: 50 },
        { grade: 'B', label: 'B', minPercentage: 0 },
      ],
    };
    expect(calculatePassRate([80], letters)).toBeNull();
  });
});

describe('effectiveGradingKey', () => {
  it('substitutes the documented default for a missing or empty key', () => {
    expect(effectiveGradingKey(undefined).preset).toBe('linear_50');
    expect(effectiveGradingKey({ preset: 'custom', cutoffs: [] }).cutoffs).toHaveLength(6);
  });

  it('leaves a configured key untouched', () => {
    expect(effectiveGradingKey(linear50)).toBe(linear50);
  });
});
