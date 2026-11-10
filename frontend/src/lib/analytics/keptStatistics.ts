/** Merges kept statistics records into the cross-exam analytics (issue #238): an exam without results here counts through its record, deleted exams included. */
import type { ExamExerciseRecord, ExamRecord, ExerciseRecord, ExerciseScoreRecord, SubmissionRecord } from '#lib/db/schema';
import type { StoredStatistics } from '#lib/repositories/statisticsRepository';
import { snapshotRecords } from './statisticsSnapshot';

export interface AnalyticsInput {
  exams: ExamRecord[];
  exercises: ExerciseRecord[];
  examExercises: Pick<ExamExerciseRecord, 'examId' | 'exerciseId'>[];
  submissions: SubmissionRecord[];
  scores: ExerciseScoreRecord[];
}

export interface MergedAnalytics extends AnalyticsInput {
  /** Exams counted from their record because no results are left here. */
  statsOnlyExamIds: Set<string>;
  /** Records whose exam was deleted (the teacher chose to keep them). */
  deletedExams: StoredStatistics[];
  /** Maximum points per record-backed exam, from the record's exercise list. */
  maxPointsByExam: Map<string, number>;
}

const hasResult = (s: SubmissionRecord) => typeof s.totalScore === 'number' && !Number.isNaN(s.totalScore);

export function mergeKeptStatistics(live: AnalyticsInput, stored: StoredStatistics[]): MergedAnalytics {
  const liveExamIds = new Set(live.exams.map((e) => e.id));
  const gradedExamIds = new Set(live.submissions.filter(hasResult).map((s) => s.examId));
  const knownExercises = new Set(live.exercises.map((ex) => ex.id));
  const out: MergedAnalytics = {
    exams: [...live.exams],
    exercises: [...live.exercises],
    examExercises: [...live.examExercises],
    submissions: [...live.submissions],
    scores: [...live.scores],
    statsOnlyExamIds: new Set(),
    deletedExams: [],
    maxPointsByExam: new Map(),
  };
  for (const record of stored) {
    if (gradedExamIds.has(record.examId)) continue;
    const records = snapshotRecords(record.snapshot);
    if (!liveExamIds.has(record.examId)) {
      out.exams.push(records.exam);
      out.deletedExams.push(record);
    }
    out.statsOnlyExamIds.add(record.examId);
    for (const ex of records.exercises) {
      out.examExercises.push({ examId: record.examId, exerciseId: ex.id });
      if (!knownExercises.has(ex.id)) {
        knownExercises.add(ex.id);
        out.exercises.push(ex);
      }
    }
    out.maxPointsByExam.set(record.examId, records.exercises.reduce((sum, ex) => sum + (ex.maxPoints || 0), 0));
    out.submissions.push(...records.submissions);
    out.scores.push(...records.scores);
  }
  return out;
}
