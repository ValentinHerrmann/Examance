import type { SubmissionRecord } from "#lib/db/schema";

export type ExamStats = { avgScore: number | null; count: number };

/** Average score and count of graded submissions (numeric `totalScore`) per exam id. */
export function computeExamStats(submissions: SubmissionRecord[]): Map<string, ExamStats> {
  const sums = new Map<string, { sum: number; count: number }>();
  for (const s of submissions) {
    if (typeof s.totalScore === "number" && !isNaN(s.totalScore)) {
      const curr = sums.get(s.examId) || { sum: 0, count: 0 };
      curr.sum += s.totalScore;
      curr.count += 1;
      sums.set(s.examId, curr);
    }
  }
  const stats = new Map<string, ExamStats>();
  for (const [examId, { sum, count }] of sums) {
    stats.set(examId, { avgScore: Math.round((sum / count) * 10) / 10, count });
  }
  return stats;
}
