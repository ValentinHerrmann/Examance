/**
 * Statistics calculations (mean, std dev, median, histogram).
 */
import type { GradingKeyConfig } from "$lib/db/schema";
import {
  borderlineCases,
  calculateClassGradeAverage,
  calculateGradeDistribution,
  calculatePassRate,
  cutoffThreshold,
  effectiveGradingKey,
  gradeColorForPercentage,
  type BorderlineCase,
  type GradeDistributionBucket,
} from "./gradingKey";

export interface SummaryStats {
  count: number;
  mean: number;
  stdDev: number;
  median: number;
  min: number;
  max: number;
  histogram: { binStart: number; binEnd: number; count: number }[];
}

export interface PercentageEntry {
  /** 0–100, clamped. */
  percentage: number;
  gradedCount: number;
  totalCount: number;
  /** False while some exercise is ungraded: `percentage` is then provisional. */
  isComplete: boolean;
  /** Points achieved so far, and the maximum those graded exercises were worth. */
  gradedPoints: number;
  gradedMaxPoints: number;
}

/** Bonus exercises (`maxPoints: 0`) and MC penalties push percentages past both ends. */
function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Calculate preliminary percentage for a submission based on graded exercises only.
 * For example, if exercises have maxPoints {5,3,10,15} and scores are {4,1,null,null},
 * the percentage is (4+1)/(5+3) = 62.5%
 *
 * @param exerciseMaxPoints - array of max points per exercise in order
 * @param exerciseScores - array of actual scores (null/undefined = not graded)
 * @returns percentage entry or null if no exercises are graded
 */
export function calculateSubmissionPercentage(
  exerciseMaxPoints: number[],
  exerciseScores: (number | null | undefined)[],
): PercentageEntry | null {
  let gradedSum = 0;
  let gradedMaxSum = 0;
  let gradedCount = 0;
  const totalCount = exerciseMaxPoints.length;

  for (let i = 0; i < exerciseMaxPoints.length; i++) {
    const score = exerciseScores[i];
    if (score !== null && score !== undefined && Number.isFinite(score)) {
      gradedSum += score;
      gradedMaxSum += exerciseMaxPoints[i];
      gradedCount++;
    }
  }

  if (gradedCount === 0 || gradedMaxSum === 0) return null;

  return {
    percentage: clampPercentage((gradedSum / gradedMaxSum) * 100),
    gradedCount,
    totalCount,
    isComplete: gradedCount === totalCount,
    gradedPoints: gradedSum,
    gradedMaxPoints: gradedMaxSum,
  };
}

export function calculateSummaryStats(scores: number[]): SummaryStats | null {
  if (scores.length === 0) return null;

  const count = scores.length;
  const sorted = [...scores].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[count - 1];

  const sum = scores.reduce((acc, x) => acc + x, 0);
  const mean = sum / count;

  const variance =
    scores.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / count;
  const stdDev = Math.sqrt(variance);

  const mid = Math.floor(count / 2);
  const median =
    count % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  // Build 5 histogram bins
  const binCount = 5;
  const step = (max - min) / binCount || 1;
  const histogram = Array.from({ length: binCount }).map((_, i) => ({
    binStart: Math.round((min + i * step) * 10) / 10,
    binEnd: Math.round((min + (i + 1) * step) * 10) / 10,
    count: 0,
  }));

  scores.forEach((s) => {
    let binIdx = Math.floor((s - min) / step);
    if (binIdx >= binCount) binIdx = binCount - 1;
    histogram[binIdx].count++;
  });

  return {
    count,
    mean: Math.round(mean * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    median: Math.round(median * 100) / 100,
    min,
    max,
    histogram,
  };
}

/** Histogram bins are never wider than this — the long-standing default. */
const MAX_BIN_WIDTH = 5;
/** Below this, a key gets uneven bins instead of ever finer ones (see `histogramBoundaries`). */
const MIN_BIN_WIDTH = 0.5;
/**
 * How far a threshold may sit off a grid line and still count as on it: 83.33 is the two-decimal
 * 250/3. The extra epsilon keeps a threshold exactly one hundredth off (85.01 - 85 is
 * 0.010000000000005 in floats) on the grid.
 */
const GRID_TOLERANCE = 0.01 + 1e-9;

/** The key's grade thresholds strictly inside 0–100, ascending — 0 and 100 are the axis ends anyway. */
function interiorThresholds(keyConfig?: GradingKeyConfig): number[] {
  const thresholds = effectiveGradingKey(keyConfig)
    .cutoffs.map((c) => cutoffThreshold(c.minPercentage))
    .filter((t) => Number.isFinite(t) && t > 0 && t < 100);
  return [...new Set(thresholds)].sort((a, b) => a - b);
}

/** Interior grid line of `binCount` equal bins for each threshold, or null if one is off the grid or two share a line. */
function gridLines(thresholds: number[], binCount: number): number[] | null {
  const lines = thresholds.map((t) => Math.round((t * binCount) / 100));
  const fits = thresholds.every(
    (t, i) =>
      lines[i] > 0 &&
      lines[i] < binCount &&
      Math.abs(t - (lines[i] * 100) / binCount) <= GRID_TOLERANCE,
  );
  return fits && new Set(lines).size === lines.length ? lines : null;
}

function binCountFor(thresholds: number[]): number | null {
  const counts: number[] = [];
  for (let n = Math.ceil(100 / MAX_BIN_WIDTH); n <= Math.floor(100 / MIN_BIN_WIDTH); n++) {
    counts.push(n);
  }
  // 10000 % n === 0 is exactly "100/n has at most two decimals".
  return (
    counts.find((n) => 10000 % n === 0 && gridLines(thresholds, n)) ??
    counts.find((n) => gridLines(thresholds, n)) ??
    null
  );
}

/**
 * Number of equal histogram bins for a grading key: the fewest — so the widest, at most 5 % —
 * that put a bin boundary on every grade cutoff, so no bin straddles two grades. Steps with at
 * most two decimals (5, 4, 2.5, 2, 1.25, 1, 0.8, 0.5 %) win: linear_50's 62.5 % gives 2.5 %,
 * not the equally valid but unreadable 100/24 %. A key built on thirds (83.33, 66.66 …) has no
 * such step and takes the widest 100/n that fits. Null when nothing down to 0.5 % fits.
 */
export function histogramBinCount(keyConfig?: GradingKeyConfig): number | null {
  return binCountFor(interiorThresholds(keyConfig));
}

/**
 * Ascending bin boundaries from 0 to 100. Equal steps where the key allows it (see
 * `histogramBinCount`), with the boundary at each cutoff set to its exact threshold so every
 * submission lands in a bin of its own grade. A key too fine for that (a cutoff at 33.37 %)
 * falls back to 5 % steps split at each cutoff: uneven, but still one grade per bin.
 */
export function histogramBoundaries(keyConfig?: GradingKeyConfig): number[] {
  const thresholds = interiorThresholds(keyConfig);
  const binCount = binCountFor(thresholds);
  if (binCount === null) {
    const grid = Array.from(
      { length: 100 / MAX_BIN_WIDTH + 1 },
      (_, k) => k * MAX_BIN_WIDTH,
    ).filter(
      (g) =>
        g === 0 ||
        g === 100 ||
        thresholds.every((t) => Math.abs(t - g) > GRID_TOLERANCE),
    );
    return [...new Set([...grid, ...thresholds])].sort((a, b) => a - b);
  }
  // k * 100 / n, not k * (100 / n): 21 * (100 / 24) is 87.50000000000001.
  const boundaries = Array.from(
    { length: binCount + 1 },
    (_, k) => (k * 100) / binCount,
  );
  gridLines(thresholds, binCount)?.forEach((line, i) => {
    boundaries[line] = thresholds[i];
  });
  return boundaries;
}

/**
 * A bin of the percentage histogram (0–100 %, bins from `histogramBoundaries`; 100 % lands in
 * the last bin rather than an extra one). No bin straddles a cutoff, so the grade of its lower
 * bound is the grade of everything in it.
 */
export interface PercentageHistogramBin {
  binStart: number;
  binEnd: number;
  count: number;
  /** Subset of `count` whose submission is not fully graded yet. */
  provisionalCount: number;
  /** CSS colour token, e.g. `var(--color-grade-1)`. */
  colorVar: string;
  /** `binStart` is where a grade begins (a cutoff, or 0): the lowest bin of its grade. */
  startsGrade: boolean;
}

export function calculatePercentageHistogram(
  percentages: number[],
  provisionalFlags: boolean[] = [],
  keyConfig?: GradingKeyConfig,
): PercentageHistogramBin[] {
  const boundaries = histogramBoundaries(keyConfig);
  const thresholds = new Set(interiorThresholds(keyConfig));
  const bins: PercentageHistogramBin[] = boundaries.slice(0, -1).map((start, i) => ({
    binStart: start,
    binEnd: boundaries[i + 1],
    count: 0,
    provisionalCount: 0,
    colorVar: gradeColorForPercentage(start, keyConfig),
    startsGrade: i === 0 || thresholds.has(start),
  }));

  percentages.forEach((p, i) => {
    // Rounded like `cutoffIndex`, so 35/40 = 87.4999… lands in the 87.5 bin it is graded by.
    const value = Math.round(clampPercentage(p) * 100) / 100;
    let binIdx = bins.length - 1;
    while (binIdx > 0 && value < bins[binIdx].binStart) binIdx--;
    bins[binIdx].count++;
    if (provisionalFlags[i]) bins[binIdx].provisionalCount++;
  });

  return bins;
}

/** Integer count axis with one unit of headroom — counts are whole students. */
export function countAxis(
  counts: number[],
  maxTicks: number,
): { max: number; ticks: number[] } {
  const max = Math.max(1, ...counts) + 1;
  const step = Math.max(1, Math.ceil(max / maxTicks));
  return {
    max,
    ticks: Array.from(
      { length: Math.floor(max / step) + 1 },
      (_, i) => i * step,
    ),
  };
}

export interface ExamResult extends PercentageEntry {
  submissionId: string;
}

/** Everything the exam stats page shows, derived from one list of per-submission results. */
export interface ExamStats {
  results: ExamResult[];
  /** Over percentages; null until something is graded. */
  summary: SummaryStats | null;
  meanPoints: number | null;
  gradeAverage: number | null;
  passRate: number | null;
  bins: PercentageHistogramBin[];
  /** Width of every bin in %, or null when the key forced uneven bins. */
  binWidth: number | null;
  gradeBuckets: GradeDistributionBucket[];
  /** Results within the borderline windows of a grade boundary (`BORDERLINE_MARGINS`), closest first. */
  borderline: BorderlineCase[];
}

/** Provisional (partially graded) results are counted, and flagged so charts can mark them. */
export function summarizeExam(
  results: ExamResult[],
  gradingKey?: GradingKeyConfig,
): ExamStats {
  const percentages = results.map((r) => r.percentage);
  const provisional = results.map((r) => !r.isComplete);
  const binCount = histogramBinCount(gradingKey);
  return {
    results,
    summary: calculateSummaryStats(percentages),
    meanPoints:
      calculateSummaryStats(results.map((r) => r.gradedPoints))?.mean ?? null,
    gradeAverage: calculateClassGradeAverage(percentages, gradingKey),
    passRate: calculatePassRate(percentages, gradingKey),
    bins: calculatePercentageHistogram(percentages, provisional, gradingKey),
    binWidth: binCount === null ? null : 100 / binCount,
    gradeBuckets: calculateGradeDistribution(
      percentages,
      gradingKey,
      provisional,
    ),
    borderline: borderlineCases(results, gradingKey),
  };
}
