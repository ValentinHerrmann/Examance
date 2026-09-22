import type { GradeCutoff, GradingKeyConfig } from '$lib/db/schema';

export const DEFAULT_CUTOFFS_LINEAR_50: GradeCutoff[] = [
  { grade: '1', label: 'Sehr gut', minPercentage: 87.5 },
  { grade: '2', label: 'Gut', minPercentage: 75 },
  { grade: '3', label: 'Befriedigend', minPercentage: 62.5 },
  { grade: '4', label: 'Ausreichend', minPercentage: 50 },
  { grade: '5', label: 'Mangelhaft', minPercentage: 25 },
  { grade: '6', label: 'Ungenügend', minPercentage: 0 },
];

export const DEFAULT_CUTOFFS_LINEAR_40: GradeCutoff[] = [
  { grade: '1', label: 'Sehr gut', minPercentage: 85 },
  { grade: '2', label: 'Gut', minPercentage: 70 },
  { grade: '3', label: 'Befriedigend', minPercentage: 55 },
  { grade: '4', label: 'Ausreichend', minPercentage: 40 },
  { grade: '5', label: 'Mangelhaft', minPercentage: 20 },
  { grade: '6', label: 'Ungenügend', minPercentage: 0 },
];

export const DEFAULT_CUTOFFS_EVEN_SPLIT: GradeCutoff[] = [
  { grade: '1', label: 'Sehr gut', minPercentage: 83.33 },
  { grade: '2', label: 'Gut', minPercentage: 66.66 },
  { grade: '3', label: 'Befriedigend', minPercentage: 50 },
  { grade: '4', label: 'Ausreichend', minPercentage: 33.33 },
  { grade: '5', label: 'Mangelhaft', minPercentage: 16.66 },
  { grade: '6', label: 'Ungenügend', minPercentage: 0 },
];

/**
 * The key to use when an exam has none configured.
 *
 * Exams created before the grading-key editor existed, and any exam the teacher
 * never opened it for, carry no key. `calculateGradeDistribution` used to return
 * an empty array for those, which is why their stats page drew an empty chart.
 * Falling back here means every exam has a grade scale, and the stats page says
 * which one it is.
 */
export const FALLBACK_GRADING_KEY: GradingKeyConfig = {
  preset: 'linear_50',
  cutoffs: DEFAULT_CUTOFFS_LINEAR_50,
};

/** The exam's key, or the documented default when it has none. */
export function effectiveGradingKey(keyConfig?: GradingKeyConfig): GradingKeyConfig {
  if (!keyConfig?.cutoffs || keyConfig.cutoffs.length === 0) {
    return { preset: 'linear_50', cutoffs: structuredClone(DEFAULT_CUTOFFS_LINEAR_50) };
  }
  return keyConfig;
}

/**
 * Cutoffs are compared against a percentage rounded to two decimals.
 *
 * 35/40 is 87.5 % exactly in decimal and 87.49999999999999 in binary floating
 * point, so a bare `>=` against an 87.5 cutoff quietly demoted that pupil from
 * a 1 to a 2. Rounding to two places before comparing is what a teacher doing
 * this by hand would do, and it is stable for every realistic points/max pair.
 */
function roundedPercentage(percentage: number): number {
  return Math.round(percentage * 100) / 100;
}

export function getPresetCutoffs(preset: GradingKeyConfig['preset']): GradeCutoff[] {
  switch (preset) {
    case 'linear_50':
      return structuredClone(DEFAULT_CUTOFFS_LINEAR_50);
    case 'linear_40':
      return structuredClone(DEFAULT_CUTOFFS_LINEAR_40);
    case 'even_split':
      return structuredClone(DEFAULT_CUTOFFS_EVEN_SPLIT);
    case 'custom':
    default:
      return structuredClone(DEFAULT_CUTOFFS_LINEAR_50);
  }
}

/**
 * Calculate grade from a raw percentage (0-100) using the grading key.
 */
export function calculateGradeFromPercentage(
  percentage: number,
  keyConfig?: GradingKeyConfig
): { grade: string; label: string } | null {
  const key = effectiveGradingKey(keyConfig);

  // Sort cutoffs descending by minPercentage
  const sorted = [...key.cutoffs].sort((a, b) => b.minPercentage - a.minPercentage);
  const value = roundedPercentage(percentage);

  for (const item of sorted) {
    if (value >= item.minPercentage) {
      return { grade: item.grade, label: item.label };
    }
  }

  const fallback = sorted.at(-1);
  return fallback ? { grade: fallback.grade, label: fallback.label } : null;
}

export function calculateGrade(
  score: number,
  maxPoints: number,
  keyConfig?: GradingKeyConfig
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
  keyConfig?: GradingKeyConfig
): GradeDetail | null {
  if (!keyConfig?.cutoffs || keyConfig.cutoffs.length === 0 || maxPoints <= 0) {
    return null;
  }

  const percentage = roundedPercentage((score / maxPoints) * 100);
  const sorted = [...keyConfig.cutoffs].sort((a, b) => b.minPercentage - a.minPercentage);

  let currIdx = sorted.findIndex((item) => percentage >= item.minPercentage);
  if (currIdx === -1) {
    currIdx = sorted.length - 1;
  }

  const currentCutoff = sorted[currIdx];
  const currentMinPoints = (currentCutoff.minPercentage / 100) * maxPoints;

  let nextHigher: GradeDetail['nextHigher'] = undefined;
  if (currIdx > 0) {
    const higherCutoff = sorted[currIdx - 1];
    const higherMinPoints = (higherCutoff.minPercentage / 100) * maxPoints;
    const pointsNeeded = Math.max(0, Math.round((higherMinPoints - score) * 100) / 100);
    nextHigher = {
      grade: higherCutoff.grade,
      label: higherCutoff.label,
      pointsNeeded,
    };
  }

  let nextLower: GradeDetail['nextLower'] = undefined;
  if (currIdx < sorted.length - 1) {
    const lowerCutoff = sorted[currIdx + 1];
    const pointsBuffer = Math.max(0, Math.round((score - currentMinPoints) * 100) / 100);
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

/**
 * Grade distribution: counts how many submissions fall into each grade bracket.
 */
export interface GradeDistributionBucket {
  grade: string;
  label: string;
  count: number;
  /** Subset of `count` whose submission is not fully graded yet. */
  provisionalCount: number;
  minPercentage: number;
}

/**
 * Counts how many results fall into each grade bracket.
 *
 * Always returns one bucket per cutoff — six, for every preset — including the
 * grades nobody reached. A grade with nobody in it is information, and dropping
 * it is what stopped the chart from ever showing a 1–6 scale.
 *
 * `provisionalCount` is the subset whose submission is not fully graded yet, so
 * the chart can draw those apart instead of presenting a half-corrected class
 * as settled.
 */
export function calculateGradeDistribution(
  percentages: number[],
  keyConfig?: GradingKeyConfig,
  provisionalFlags: boolean[] = []
): GradeDistributionBucket[] {
  const key = effectiveGradingKey(keyConfig);

  // Descending by minPercentage, so the buckets come out best grade first.
  const sorted = [...key.cutoffs].sort((a, b) => b.minPercentage - a.minPercentage);

  const buckets = sorted.map((cutoff) => ({
    grade: cutoff.grade,
    label: cutoff.label,
    count: 0,
    provisionalCount: 0,
    minPercentage: cutoff.minPercentage,
  }));

  // Matched by index, not by grade string: a custom key with two rows labelled
  // "3" is two brackets, and `find` by grade silently merged their counts.
  percentages.forEach((p, i) => {
    const value = roundedPercentage(p);
    let idx = sorted.findIndex((cutoff) => value >= cutoff.minPercentage);
    if (idx === -1) idx = sorted.length - 1;
    buckets[idx].count++;
    if (provisionalFlags[i]) buckets[idx].provisionalCount++;
  });

  return buckets;
}

/**
 * The class average grade (Notendurchschnitt) — the number a teacher is
 * actually asked for, and one the stats page never showed.
 *
 * Averages the numeric grades, not the percentages: a class of three 1s and
 * three 5s averages to 3.0, which is what a Notenspiegel reports, whereas
 * averaging percentages and then grading the result gives a different answer.
 * Non-numeric grade labels (a custom key using "A"/"B") are skipped.
 */
export function calculateClassGradeAverage(
  percentages: number[],
  keyConfig?: GradingKeyConfig
): number | null {
  const numeric: number[] = [];
  for (const p of percentages) {
    const grade = calculateGradeFromPercentage(p, keyConfig);
    const value = grade ? Number.parseFloat(grade.grade) : NaN;
    if (!Number.isNaN(value)) numeric.push(value);
  }
  if (numeric.length === 0) return null;
  return Math.round((numeric.reduce((a, b) => a + b, 0) / numeric.length) * 100) / 100;
}

/**
 * Share of results at or above the pass mark, as a fraction of 0–1.
 *
 * "Pass" is the lowest cutoff whose grade parses to <= 4 — grade 4
 * ("ausreichend") in every bundled preset. A custom key without numeric grades
 * has no pass mark, and this returns null rather than inventing one.
 */
export function calculatePassRate(
  percentages: number[],
  keyConfig?: GradingKeyConfig
): number | null {
  if (percentages.length === 0) return null;
  const key = effectiveGradingKey(keyConfig);
  const passing = key.cutoffs
    .filter((c) => {
      const value = Number.parseFloat(c.grade);
      return !Number.isNaN(value) && value <= 4;
    })
    .map((c) => c.minPercentage);
  if (passing.length === 0) return null;

  const passMark = Math.min(...passing);
  const passed = percentages.filter((p) => roundedPercentage(p) >= passMark).length;
  return passed / percentages.length;
}