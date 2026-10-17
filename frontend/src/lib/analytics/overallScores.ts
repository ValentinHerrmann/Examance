/**
 * Overall-score distribution of the global analysis: every fully graded submission's total as a
 * percentage of its own exam's maximum points (exams differ), summarized like one exam's results.
 */
import type { ExerciseRecord, GradingKeyConfig, SubmissionRecord } from "#lib/db/schema";
import { DEFAULT_CUTOFFS_LINEAR_40 } from "./gradingKey";
import { clampPercentage, summarizeExam, type ExamResult, type ExamStats, type PercentageHistogramBin } from "./stats";

/**
 * Grade colours, bins and bands of the global chart. The exams behind one bar may use different
 * keys, so the chart uses one fixed reference key (linear, pass mark 40 %; issue #89).
 */
export const OVERALL_GRADING_KEY: GradingKeyConfig = {
  preset: "linear_40",
  cutoffs: DEFAULT_CUTOFFS_LINEAR_40,
};

export interface OverallScoreDistribution {
  /** Ascending bins aligned to `OVERALL_GRADING_KEY`; 100 % lands in the last one. */
  bins: PercentageHistogramBin[];
  /** Everything the exam stats chart model needs (summary, bins, grade buckets). */
  stats: ExamStats;
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
  submissions: (Pick<SubmissionRecord, "examId" | "totalScore"> & { id?: string })[],
  maxPointsByExam: ReadonlyMap<string, number>,
): OverallScoreDistribution {
  const results: ExamResult[] = [];
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
    // Clamped (bonus points, MC penalties); the histogram rounds like the exam one, so float
    // noise (8.1 / 9 is 89.99999999999999 %) cannot drop a 90 % result into the bin below.
    results.push({
      submissionId: submission.id ?? "",
      percentage: clampPercentage((score / max) * 100),
      gradedCount: 1,
      totalCount: 1,
      isComplete: true,
      gradedPoints: score,
      gradedMaxPoints: max,
    });
  }

  const stats = summarizeExam(results, OVERALL_GRADING_KEY);
  return { bins: stats.bins, stats, counted: results.length, ungraded, withoutMaxPoints };
}
