import { describe, it, expect } from 'vitest';
import {
  calculateSubmissionPercentage,
  calculatePercentageHistogram,
  histogramBinCount,
  histogramBoundaries,
  type PercentageHistogramBin,
} from '../src/lib/analytics/stats';
import {
  calculateGradeDistribution,
  calculateGradeFromPercentage,
  calculateClassGradeAverage,
  calculatePassRate,
  effectiveGradingKey,
  gradeColorVar,
  gradeColorForPercentage,
  DEFAULT_CUTOFFS_LINEAR_50,
  DEFAULT_CUTOFFS_LINEAR_40,
  DEFAULT_CUTOFFS_EVEN_SPLIT,
} from '../src/lib/analytics/gradingKey';
import type { GradingKeyConfig } from '../src/lib/db/schema';

const linear50: GradingKeyConfig = {
  preset: 'linear_50',
  cutoffs: DEFAULT_CUTOFFS_LINEAR_50,
};

/** Build a custom key from bare minPercentages: grade "1" is the first (best) entry, etc. */
function customKey(minPercentages: number[]): GradingKeyConfig {
  return {
    preset: 'custom',
    cutoffs: minPercentages.map((minPercentage, i) => ({
      grade: String(i + 1),
      label: `Grade ${i + 1}`,
      minPercentage,
    })),
  };
}

// Keys shared by the bin-width tests and the grade-colour invariant tests below.
const linear40: GradingKeyConfig = {
  preset: 'linear_40',
  cutoffs: DEFAULT_CUTOFFS_LINEAR_40,
};
const evenSplit: GradingKeyConfig = {
  preset: 'even_split',
  cutoffs: DEFAULT_CUTOFFS_EVEN_SPLIT,
};
const oberstufe = customKey([95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 33, 27, 20, 0]);
const custom875_33_0 = customKey([87.5, 33, 0]);
const outOfRangeCutoffs = customKey([110, 50, -5]);
const threeDecimalCutoffs = customKey([66.667, 33.333, 0]);
const tooFineCutoffs = customKey([33.37, 0]);
const threeAndThreeNoZero: GradingKeyConfig = {
  preset: 'custom',
  cutoffs: [
    { grade: '3', label: 'Upper 3', minPercentage: 60 },
    { grade: '3', label: 'Lower 3', minPercentage: 50 },
  ],
};

const KEYS_FOR_WIDTH: (GradingKeyConfig | undefined)[] = [
  linear40,
  linear50,
  undefined,
  evenSplit,
  oberstufe,
  custom875_33_0,
  outOfRangeCutoffs,
  threeDecimalCutoffs,
  tooFineCutoffs,
];

const KEYS_FOR_INVARIANT: (GradingKeyConfig | undefined)[] = [
  ...KEYS_FOR_WIDTH,
  threeAndThreeNoZero,
];

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
  it('defaults to 40 bins of 2.5% each, off the default grading key', () => {
    const bins = calculatePercentageHistogram([2, 95]);
    expect(bins).toHaveLength(40);
    expect(bins[0]).toMatchObject({ binStart: 0, binEnd: 2.5, count: 1 });
    const bin95 = bins.find((b) => b.binStart === 95);
    expect(bin95?.count).toBe(1);
    expect(bins.filter((b) => b.count > 0)).toHaveLength(2);
  });

  it('puts 100% in the top bin rather than a forty-first', () => {
    const bins = calculatePercentageHistogram([100]);
    expect(bins).toHaveLength(40);
    expect(bins[39]).toMatchObject({ binEnd: 100, count: 1 });
  });

  it('tracks provisional results separately from the total', () => {
    const bins = calculatePercentageHistogram([95, 95], [true, false]);
    const bin95 = bins.find((b) => b.binStart === 95);
    expect(bin95?.count).toBe(2);
    expect(bin95?.provisionalCount).toBe(1);
  });

  it('colours a bin by the grade of its lower bound', () => {
    // linear_50: grade 1 starts at 87.5%. The 85-87.5 bin's lower bound (85) is still grade 2.
    const bins = calculatePercentageHistogram([0], [], linear50);
    expect(bins[34]).toMatchObject({
      binStart: 85,
      binEnd: 87.5,
      colorVar: 'var(--color-grade-2)',
      startsGrade: false,
    });
    expect(bins[35]).toMatchObject({
      binStart: 87.5,
      binEnd: 90,
      colorVar: 'var(--color-grade-1)',
      startsGrade: true,
    });
    expect(bins[36]).toMatchObject({ binStart: 90, startsGrade: false });
    expect(bins[0].startsGrade).toBe(true);
  });

  it('rounds a float just under a cutoff into the cutoff bin, like grading does', () => {
    // 35/40 is 87.5 exactly in decimal and 87.49999999999999 in binary float.
    const bins = calculatePercentageHistogram([(35 / 40) * 100], [], linear50);
    const bin875 = bins.find((b) => b.binStart === 87.5);
    expect(bin875?.count).toBe(1);
  });
});

describe('histogram bin width', () => {
  it('picks the fewest equal bins that put a boundary on every cutoff', () => {
    expect(histogramBinCount(linear40)).toBe(20);
    expect(histogramBinCount(linear50)).toBe(40);
    expect(histogramBinCount(undefined)).toBe(40);
    expect(histogramBinCount(evenSplit)).toBe(24);
    expect(histogramBinCount(oberstufe)).toBe(100);
    expect(histogramBinCount(custom875_33_0)).toBe(200);
    expect(histogramBinCount(outOfRangeCutoffs)).toBe(20);
    expect(histogramBinCount(threeDecimalCutoffs)).toBe(21);
  });

  it('sets even_split boundaries to the exact thresholds, not a rounded division', () => {
    const boundaries = histogramBoundaries(evenSplit);
    expect(boundaries).toHaveLength(25);
    for (const t of [16.66, 33.33, 50, 66.66, 83.33]) {
      expect(boundaries).toContain(t);
    }
  });

  it('sets three-decimal boundaries to the rounded cutoffThreshold values', () => {
    const boundaries = histogramBoundaries(threeDecimalCutoffs);
    expect(boundaries).toContain(33.34);
    expect(boundaries).toContain(66.67);
  });

  it('falls back to uneven, 5%-capped bins when no equal grid fits', () => {
    expect(histogramBinCount(tooFineCutoffs)).toBeNull();
    const boundaries = histogramBoundaries(tooFineCutoffs);
    expect(boundaries[0]).toBe(0);
    expect(boundaries[boundaries.length - 1]).toBe(100);
    expect(boundaries).toContain(33.37);
    for (let i = 1; i < boundaries.length; i++) {
      expect(boundaries[i]).toBeGreaterThan(boundaries[i - 1]);
    }
  });

  it('never opens a bin wider than 5%, for any of the keys above', () => {
    for (const key of KEYS_FOR_WIDTH) {
      const boundaries = histogramBoundaries(key);
      for (let i = 1; i < boundaries.length; i++) {
        expect(boundaries[i] - boundaries[i - 1]).toBeLessThanOrEqual(5 + 1e-9);
      }
    }
  });
});

describe('grade colour never straddles a bin', () => {
  // Mirrors calculatePercentageHistogram's own bin search — built once per key from bins
  // that are already computed, never re-derived per value.
  function binFor(bins: PercentageHistogramBin[], v: number): PercentageHistogramBin {
    let idx = bins.length - 1;
    while (idx > 0 && v < bins[idx].binStart) idx--;
    return bins[idx];
  }

  it('every hundredth-percent value gets the colour of the bin it falls in', () => {
    for (const key of KEYS_FOR_INVARIANT) {
      const bins = calculatePercentageHistogram([], [], key);
      const mismatches: { v: number; expected: string; actual: string }[] = [];
      for (let i = 0; i <= 10000; i++) {
        const v = i / 100;
        const bin = binFor(bins, v);
        const actual = gradeColorForPercentage(v, key);
        if (actual !== bin.colorVar) {
          mismatches.push({ v, expected: bin.colorVar, actual });
        }
      }
      expect(mismatches).toEqual([]);
    }
  });

  it('the histogram and the grade distribution agree on counts per colour', () => {
    const percentages = Array.from({ length: 10001 }, (_, i) => i / 100);
    for (const key of KEYS_FOR_INVARIANT) {
      const bins = calculatePercentageHistogram(percentages, [], key);
      const histByColor = new Map<string, number>();
      bins.forEach((b) =>
        histByColor.set(b.colorVar, (histByColor.get(b.colorVar) ?? 0) + b.count),
      );

      const buckets = calculateGradeDistribution(percentages, key);
      const bucketByColor = new Map<string, number>();
      buckets.forEach((b, i) => {
        const color = gradeColorVar(i, buckets.length);
        bucketByColor.set(color, (bucketByColor.get(color) ?? 0) + b.count);
      });

      // Union of colours: an out-of-range cutoff (e.g. minPercentage 110) makes an empty
      // bucket that no bin's colorVar ever matches, so one side can legitimately lack a key
      // the other has at 0 — normalize both onto the same key set before comparing.
      const colors = new Set([...histByColor.keys(), ...bucketByColor.keys()]);
      const histCounts: Record<string, number> = {};
      const bucketCounts: Record<string, number> = {};
      for (const color of colors) {
        histCounts[color] = histByColor.get(color) ?? 0;
        bucketCounts[color] = bucketByColor.get(color) ?? 0;
      }
      expect(histCounts).toEqual(bucketCounts);
    }
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
