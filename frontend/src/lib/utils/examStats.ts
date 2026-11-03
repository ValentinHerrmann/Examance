import type { SubmissionRecord } from "#lib/db/schema";

/** `count` = graded submissions (numeric `totalScore`), `submissionCount` = all of the exam's submissions, graded or not. */
export type ExamStats = { avgScore: number | null; count: number; submissionCount: number };

/** Average score, graded count and submission count per exam id. */
export function computeExamStats(submissions: SubmissionRecord[]): Map<string, ExamStats> {
  const sums = new Map<string, { sum: number; count: number; submissionCount: number }>();
  for (const s of submissions) {
    const curr = sums.get(s.examId) || { sum: 0, count: 0, submissionCount: 0 };
    curr.submissionCount += 1;
    if (typeof s.totalScore === "number" && !isNaN(s.totalScore)) {
      curr.sum += s.totalScore;
      curr.count += 1;
    }
    sums.set(s.examId, curr);
  }
  const stats = new Map<string, ExamStats>();
  for (const [examId, { sum, count, submissionCount }] of sums) {
    stats.set(examId, { avgScore: count ? Math.round((sum / count) * 10) / 10 : null, count, submissionCount });
  }
  return stats;
}
