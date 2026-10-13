/** Per-exam results as the stats page, the CSV and the raw export show them (one derivation, so numbers match). */
import type { ExamRecord, ExerciseRecord, ExerciseScoreRecord, StudentRecord, SubmissionRecord } from '#lib/db/schema';
import { translate } from '#lib/i18n';
import { buildSubmissionMap } from '#lib/utils/studentLookup';
import type { CsvExportRow } from './csvExport';
import { calculateGradeFromPercentage } from './gradingKey';
import { calculateSubmissionPercentage, summarizeExam, type ExamResult, type ExamStats } from './stats';

export interface ComputedResults {
  stats: ExamStats;
  /** Null when no exercise carries points. */
  totalMaxPoints: number | null;
}

/** Submissions without any graded exercise get no result. */
export function computeExamResults(
  exam: ExamRecord | null,
  exercises: ExerciseRecord[],
  submissions: SubmissionRecord[],
  scoreRecords: ExerciseScoreRecord[]
): ComputedResults {
  const exerciseMaxPoints = exercises.map((ex) => ex.maxPoints || 0);
  const scores = new Map<string, number>();
  for (const sc of scoreRecords) {
    if (typeof sc.score === 'number' && !isNaN(sc.score)) scores.set(`${sc.submissionId}:${sc.exerciseId}`, sc.score);
  }
  const results: ExamResult[] = [];
  for (const sub of submissions) {
    const ordered = exercises.map((ex) => scores.get(`${sub.id}:${ex.id}`) ?? null);
    const entry = calculateSubmissionPercentage(exerciseMaxPoints, ordered);
    if (entry) results.push({ ...entry, submissionId: sub.id });
  }
  return {
    stats: summarizeExam(results, exam?.gradingKey),
    totalMaxPoints: exerciseMaxPoints.reduce((sum, p) => sum + p, 0) || null,
  };
}

export type GradingState = 'complete' | 'partial' | 'ungraded';

/** A CSV row plus what the summary PDF and the graded-scan export need on top. */
export interface GradeRow extends CsvExportRow {
  submissionId?: string;
  state: GradingState;
}

/** One row per student, ungraded ones included. */
export async function buildGradeRows(
  exam: ExamRecord | null,
  students: StudentRecord[],
  submissions: SubmissionRecord[],
  { stats, totalMaxPoints }: ComputedResults
): Promise<GradeRow[]> {
  const submissionByStudent = await buildSubmissionMap(submissions, students);
  const resultBySubmission = new Map(stats.results.map((r) => [r.submissionId, r]));
  const ungraded = translate('stats.exportModal.ungraded');

  return students.map((st) => {
    const sub = submissionByStudent.get(st.pseudonymId);
    const result = sub ? resultBySubmission.get(sub.id) : undefined;
    const grade = result ? calculateGradeFromPercentage(result.percentage, exam?.gradingKey) : null;
    return {
      studentPseudonymId: st.pseudonymId,
      fallbackCode: st.fallbackCode || '',
      studentName: st.studentName || '',
      totalScore: result ? Math.round(result.gradedPoints * 100) / 100 : ungraded,
      maxPoints: totalMaxPoints ?? '',
      percentage: result ? Math.round(result.percentage * 10) / 10 : ungraded,
      grade: grade ? grade.grade : ungraded,
      status: result && !result.isComplete ? translate('stats.exportModal.provisional') : '',
      submissionId: sub?.id,
      state: !result ? 'ungraded' : result.isComplete ? 'complete' : 'partial',
    };
  });
}
