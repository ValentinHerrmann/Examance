/**
 * Statistics calculations (mean, std dev, median, histogram).
 */

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
  /**
   * True when every exercise has a score. A false value means `percentage` is
   * provisional — computed over the exercises corrected so far — and callers
   * must present it as such rather than mixing it in with finished results.
   */
  isComplete: boolean;
  /** Points achieved so far, and the maximum those graded exercises were worth. */
  gradedPoints: number;
  gradedMaxPoints: number;
}

/**
 * Percentages are clamped to 0–100.
 *
 * Both ends are reachable. A bonus exercise with `maxPoints: 0` adds its score
 * to the numerator and nothing to the denominator, and MC penalties
 * (`lib/grading/mcScore.ts`) produce negative scores. Unclamped, a 130 % pupil
 * was drawn inside the bar labelled "90-100%", graded a 1, and pulled the class
 * average above what anyone could score.
 */
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
  exerciseScores: (number | null | undefined)[]
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

  const variance = scores.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / count;
  const stdDev = Math.sqrt(variance);

  const mid = Math.floor(count / 2);
  const median = count % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

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

/**
 * Build a percentage-based histogram (0-100%, fixed 10 bins of 10% each).
 */
export interface PercentageHistogramBin {
  binStart: number;
  binEnd: number;
  count: number;
  /** Subset of `count` whose submission is not fully graded yet. */
  provisionalCount: number;
}

export function calculatePercentageHistogram(
  percentages: number[],
  provisionalFlags: boolean[] = []
): PercentageHistogramBin[] {
  const bins: PercentageHistogramBin[] = Array.from({ length: 10 }).map((_, i) => ({
    binStart: i * 10,
    binEnd: (i + 1) * 10,
    count: 0,
    provisionalCount: 0,
  }));

  percentages.forEach((p, i) => {
    // Clamping the value, not just the index: an out-of-range percentage used
    // to land in the 90-100 bin while still reading as 130 % everywhere else.
    const value = clampPercentage(p);
    let binIdx = Math.floor(value / 10);
    if (binIdx >= 10) binIdx = 9;
    bins[binIdx].count++;
    if (provisionalFlags[i]) bins[binIdx].provisionalCount++;
  });

  return bins;
}
