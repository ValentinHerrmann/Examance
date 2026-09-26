import type { GradeCutoff, GradingKeyConfig } from "$lib/db/schema";

export const DEFAULT_CUTOFFS_LINEAR_50: GradeCutoff[] = [
  { grade: "1", label: "Sehr gut", minPercentage: 87.5 },
  { grade: "2", label: "Gut", minPercentage: 75 },
  { grade: "3", label: "Befriedigend", minPercentage: 62.5 },
  { grade: "4", label: "Ausreichend", minPercentage: 50 },
  { grade: "5", label: "Mangelhaft", minPercentage: 25 },
  { grade: "6", label: "Ungenügend", minPercentage: 0 },
];

export const DEFAULT_CUTOFFS_LINEAR_40: GradeCutoff[] = [
  { grade: "1", label: "Sehr gut", minPercentage: 85 },
  { grade: "2", label: "Gut", minPercentage: 70 },
  { grade: "3", label: "Befriedigend", minPercentage: 55 },
  { grade: "4", label: "Ausreichend", minPercentage: 40 },
  { grade: "5", label: "Mangelhaft", minPercentage: 20 },
  { grade: "6", label: "Ungenügend", minPercentage: 0 },
];

export const DEFAULT_CUTOFFS_EVEN_SPLIT: GradeCutoff[] = [
  { grade: "1", label: "Sehr gut", minPercentage: 83.33 },
  { grade: "2", label: "Gut", minPercentage: 66.66 },
  { grade: "3", label: "Befriedigend", minPercentage: 50 },
  { grade: "4", label: "Ausreichend", minPercentage: 33.33 },
  { grade: "5", label: "Mangelhaft", minPercentage: 16.66 },
  { grade: "6", label: "Ungenügend", minPercentage: 0 },
];

/** The exam's key, or the linear-50 default when it has none. */
export function effectiveGradingKey(
  keyConfig?: GradingKeyConfig,
): GradingKeyConfig {
  if (!keyConfig?.cutoffs || keyConfig.cutoffs.length === 0) {
    return {
      preset: "linear_50",
      cutoffs: structuredClone(DEFAULT_CUTOFFS_LINEAR_50),
    };
  }
  return keyConfig;
}

/** Best grade first. */
function sortedCutoffs(cutoffs: GradeCutoff[]): GradeCutoff[] {
  return [...cutoffs].sort((a, b) => b.minPercentage - a.minPercentage);
}

/**
 * Index of the cutoff a percentage reaches. Rounded to two decimals first:
 * 35/40 is 87.49999999999999 in floating point and must still reach 87.5.
 */
function cutoffIndex(sorted: GradeCutoff[], percentage: number): number {
  const value = Math.round(percentage * 100) / 100;
  const idx = sorted.findIndex((cutoff) => value >= cutoff.minPercentage);
  return idx === -1 ? sorted.length - 1 : idx;
}

const GRADE_COLOR_RAMP = 6;

/**
 * CSS colour token for the `index`-th of `total` sorted best-first buckets, scaled onto the
 * 6-step `--color-grade-1..6` ramp (dark green -> dark red). A standard 6-row key maps 1:1;
 * a custom key with a different row count is scaled by position so it still spans the ramp.
 */
export function gradeColorVar(index: number, total: number): string {
  const step =
    total <= 1
      ? 0
      : Math.round((index / (total - 1)) * (GRADE_COLOR_RAMP - 1));
  return `var(--color-grade-${step + 1})`;
}

/**
 * Colour token for a percentage under a grading key. A range's grade is decided by the grade
 * of its *lower* bound: a bin/bucket straddling a cutoff (e.g. 85-90% with a cutoff at 87.5%)
 * takes the lower grade, matching how a submission scoring exactly the lower bound would grade.
 */
export function gradeColorForPercentage(
  percentage: number,
  keyConfig?: GradingKeyConfig,
): string {
  const sorted = sortedCutoffs(effectiveGradingKey(keyConfig).cutoffs);
  return gradeColorVar(cutoffIndex(sorted, percentage), sorted.length);
}

export function getPresetCutoffs(
  preset: GradingKeyConfig["preset"],
): GradeCutoff[] {
  switch (preset) {
    case "linear_50":
      return structuredClone(DEFAULT_CUTOFFS_LINEAR_50);
    case "linear_40":
      return structuredClone(DEFAULT_CUTOFFS_LINEAR_40);
    case "even_split":
      return structuredClone(DEFAULT_CUTOFFS_EVEN_SPLIT);
    case "custom":
    default:
      return structuredClone(DEFAULT_CUTOFFS_LINEAR_50);
  }
}

/**
 * Calculate grade from a raw percentage (0-100) using the grading key.
 */
export function calculateGradeFromPercentage(
  percentage: number,
  keyConfig?: GradingKeyConfig,
): { grade: string; label: string } | null {
  const sorted = sortedCutoffs(effectiveGradingKey(keyConfig).cutoffs);
  const cutoff = sorted[cutoffIndex(sorted, percentage)];
  return cutoff ? { grade: cutoff.grade, label: cutoff.label } : null;
}

export function calculateGrade(
  score: number,
  maxPoints: number,
  keyConfig?: GradingKeyConfig,
): { grade: string; label: string } | null {
  if (!keyConfig?.cutoffs || keyConfig.cutoffs.length === 0 || maxPoints <= 0) {
    return null;
  }

  const percentage = (score / maxPoints) * 100;
  return calculateGradeFromPercentage(percentage, keyConfig);
}

export interface GradeDetail {
  grade: string;
  label: string;
  minPercentage: number;
  minPoints: number;
  nextHigher?: {
    grade: string;
    label: string;
    pointsNeeded: number;
  };
  nextLower?: {
    grade: string;
    label: string;
    pointsBuffer: number;
  };
}

export function calculateGradeDetail(
  score: number,
  maxPoints: number,
  keyConfig?: GradingKeyConfig,
): GradeDetail | null {
  if (!keyConfig?.cutoffs || keyConfig.cutoffs.length === 0 || maxPoints <= 0) {
    return null;
  }

  const sorted = sortedCutoffs(keyConfig.cutoffs);
  const currIdx = cutoffIndex(sorted, (score / maxPoints) * 100);

  const currentCutoff = sorted[currIdx];
  const currentMinPoints = (currentCutoff.minPercentage / 100) * maxPoints;

  let nextHigher: GradeDetail["nextHigher"] = undefined;
  if (currIdx > 0) {
    const higherCutoff = sorted[currIdx - 1];
    const higherMinPoints = (higherCutoff.minPercentage / 100) * maxPoints;
    const pointsNeeded = Math.max(
      0,
      Math.round((higherMinPoints - score) * 100) / 100,
    );
    nextHigher = {
      grade: higherCutoff.grade,
      label: higherCutoff.label,
      pointsNeeded,
    };
  }

  let nextLower: GradeDetail["nextLower"] = undefined;
  if (currIdx < sorted.length - 1) {
    const lowerCutoff = sorted[currIdx + 1];
    const pointsBuffer = Math.max(
      0,
      Math.round((score - currentMinPoints) * 100) / 100,
    );
    nextLower = {
      grade: lowerCutoff.grade,
      label: lowerCutoff.label,
      pointsBuffer,
    };
  }

  return {
    grade: currentCutoff.grade,
    label: currentCutoff.label,
    minPercentage: currentCutoff.minPercentage,
    minPoints: currentMinPoints,
    nextHigher,
    nextLower,
  };
}

export interface GradeDistributionBucket {
  grade: string;
  label: string;
  count: number;
  /** Subset of `count` whose submission is not fully graded yet. */
  provisionalCount: number;
  minPercentage: number;
}

/** One bucket per cutoff (best first), including grades nobody reached. */
export function calculateGradeDistribution(
  percentages: number[],
  keyConfig?: GradingKeyConfig,
  provisionalFlags: boolean[] = [],
): GradeDistributionBucket[] {
  const sorted = sortedCutoffs(effectiveGradingKey(keyConfig).cutoffs);
  const buckets = sorted.map(({ grade, label, minPercentage }) => ({
    grade,
    label,
    minPercentage,
    count: 0,
    provisionalCount: 0,
  }));

  // By index, not grade string: a custom key may label two brackets alike.
  percentages.forEach((p, i) => {
    const bucket = buckets[cutoffIndex(sorted, p)];
    bucket.count++;
    if (provisionalFlags[i]) bucket.provisionalCount++;
  });
  return buckets;
}

/** Numeric grade per result; NaN for non-numeric labels (a custom "A"/"B" key). */
function numericGrades(
  percentages: number[],
  keyConfig?: GradingKeyConfig,
): number[] {
  return percentages.map((p) =>
    Number.parseFloat(calculateGradeFromPercentage(p, keyConfig)?.grade ?? ""),
  );
}

/** Class average of the grades themselves (Notendurchschnitt), not of the percentages. */
export function calculateClassGradeAverage(
  percentages: number[],
  keyConfig?: GradingKeyConfig,
): number | null {
  const numeric = numericGrades(percentages, keyConfig).filter(
    (g) => !Number.isNaN(g),
  );
  if (numeric.length === 0) return null;
  return (
    Math.round((numeric.reduce((a, b) => a + b, 0) / numeric.length) * 100) /
    100
  );
}

/** Share (0–1) of results graded 4 or better; null when the key has no numeric grades. */
export function calculatePassRate(
  percentages: number[],
  keyConfig?: GradingKeyConfig,
): number | null {
  const grades = numericGrades(percentages, keyConfig);
  if (grades.length === 0 || grades.every(Number.isNaN)) return null;
  return grades.filter((g) => g <= 4).length / grades.length;
}
