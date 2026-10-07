/**
 * Overall-score distribution of the global analysis: every fully graded submission's total as a
 * percentage of its own exam's maximum points (exams differ), in fixed 10 % bins.
 */
import type { ExerciseRecord, SubmissionRecord } from "#lib/db/schema";
import { clampPercentage, type PercentageHistogramBin } from "./stats";

const BIN_WIDTH = 10;
const BIN_COUNT = 100 / BIN_WIDTH;

export interface OverallScoreDistribution {
  /** Ascending 10 % bins (0–10 … 90–100); 100 % lands in the last one. */
  bins: PercentageHistogramBin[];
  /** Submissions that made it into the bins. */
  counted: number;
  /** No total score yet (not fully graded): left out, as in every other aggregate of the page. */
  ungraded: number;
  /** Graded, but the exam's maximum is unknown or zero, so there is no percentage. */
  withoutMaxPoints: number;
}

/** Sum of an exam's exercise maxima, like the exam statistics use; 0 when it has none. */
export function examMaxPoints(exercises: Pick<ExerciseRecord, "maxPoints">[]): number {
  return exercises.reduce((sum, ex) => sum + (ex.maxPoints || 0), 0);
}

/**
 * `maxPointsByExam` maps an exam id to its maximum points. Pass only the submissions the page
 * currently includes: whatever it filters on, the histogram follows.
 */
export function calculateOverallScoreDistribution(
  submissions: Pick<SubmissionRecord, "examId" | "totalScore">[],
  maxPointsByExam: ReadonlyMap<string, number>,
): OverallScoreDistribution {
  const bins: PercentageHistogramBin[] = Array.from({ length: BIN_COUNT }, (_, i) => ({
    binStart: i * BIN_WIDTH,
    binEnd: (i + 1) * BIN_WIDTH,
    count: 0,
    provisionalCount: 0,
    // No grade colour: the exams behind one bar have different grading keys.
    colorVar: "var(--color-primary)",
    startsGrade: false,
  }));
  let counted = 0;
  let ungraded = 0;
  let withoutMaxPoints = 0;

  for (const submission of submissions) {
    const score = submission.totalScore;
    if (typeof score !== "number" || !Number.isFinite(score)) {
      ungraded++;
      continue;
    }
    const max = maxPointsByExam.get(submission.examId);
    if (max === undefined || !(max > 0)) {
      withoutMaxPoints++;
      continue;
    }
    // Clamped (bonus points, MC penalties) and rounded like the exam histogram, so float noise
    // (8.1 / 9 is 89.99999999999999 %) cannot drop a 90 % result into the bin below.
    const percentage = Math.round(clampPercentage((score / max) * 100) * 100) / 100;
    bins[Math.min(BIN_COUNT - 1, Math.floor(percentage / BIN_WIDTH))].count++;
    counted++;
  }

  return { bins, counted, ungraded, withoutMaxPoints };
}
