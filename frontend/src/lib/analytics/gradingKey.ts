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

/**
 * The lowest two-decimal percentage that reaches a cutoff under `cutoffIndex`'s rounding:
 * 87.5 stays 87.5, a hand-typed 33.333 becomes 33.34. The epsilon absorbs float noise
 * (16.66 * 100 is 1666.0000000000002).
 */
export function cutoffThreshold(minPercentage: number): number {
  return Math.ceil(minPercentage * 100 - 1e-6) / 100;
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

/** Points a result may be off a grade boundary and still count as a borderline case. */
export const BORDERLINE_MARGIN_POINTS = 1;

export interface BorderlineCase {
  submissionId: string;
  grade: string;
  label: string;
  /** Index of the grade in the key, best first (for its colour). */
  gradeIndex: number;
  gradeCount: number;
  /**
   * `'+'`: less than the margin short of the next better grade (upper end of its grade);
   * `'-'`: less than the margin above the next worse grade (lower end). A grade narrower
   * than twice the margin can put one result on both lists.
   */
  side: "+" | "-";
  /** Points achieved (so far, while provisional). */
  points: number;
  /** The boundary in points, and the grade that starts there: the next better grade for `'+'`, the result's own for `'-'`. */
  boundaryPoints: number;
  boundaryGrade: string;
  /** Distance to that boundary in points, always positive for `'+'` and ≥ 0 for `'-'`. */
  distance: number;
  percentage: number;
  /** Points the result is measured against: the exam total, or the graded exercises so far. */
  maxPoints: number;
  isComplete: boolean;
}

interface BorderlineInput {
  submissionId: string;
  percentage: number;
  gradedPoints: number;
  gradedMaxPoints: number;
  isComplete: boolean;
}

/**
 * Results within `margin` points of a grade boundary, closest first. Points are measured
 * on the result's own basis (`gradedMaxPoints`): the whole exam once it is fully graded,
 * the graded exercises so far while it is provisional. The best grade has no `'+'` and the
 * worst no `'-'`.
 */
export function borderlineCases(
  results: BorderlineInput[],
  keyConfig?: GradingKeyConfig,
  margin = BORDERLINE_MARGIN_POINTS,
): BorderlineCase[] {
  const sorted = sortedCutoffs(effectiveGradingKey(keyConfig).cutoffs);
  const boundary = (idx: number, max: number) =>
    (cutoffThreshold(sorted[idx].minPercentage) / 100) * max;
  const round = (v: number) => Math.round(v * 100) / 100;
  const cases: BorderlineCase[] = [];
  for (const r of results) {
    if (!(r.gradedMaxPoints > 0)) continue;
    const idx = cutoffIndex(sorted, r.percentage);
    const base = {
      submissionId: r.submissionId,
      grade: sorted[idx].grade,
      label: sorted[idx].label,
      gradeIndex: idx,
      gradeCount: sorted.length,
      percentage: r.percentage,
      points: round(r.gradedPoints),
      maxPoints: r.gradedMaxPoints,
      isComplete: r.isComplete,
    };
    if (idx > 0) {
      const at = round(boundary(idx - 1, r.gradedMaxPoints));
      const missing = round(at - r.gradedPoints);
      if (missing > 0 && missing < margin) {
        cases.push({ ...base, side: "+", distance: missing, boundaryPoints: at, boundaryGrade: sorted[idx - 1].grade });
      }
    }
    if (idx < sorted.length - 1) {
      const at = round(boundary(idx, r.gradedMaxPoints));
      const spare = round(r.gradedPoints - at);
      if (spare >= 0 && spare < margin) {
        cases.push({ ...base, side: "-", distance: spare, boundaryPoints: at, boundaryGrade: sorted[idx].grade });
      }
    }
  }
  return cases.sort((a, b) => a.distance - b.distance);
}
