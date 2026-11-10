/** Kept exam statistics (issue #238): the record carries no link to a student and reproduces the exam's statistics. */
import { describe, expect, it } from 'vitest';
import { computeExamResults } from '#lib/analytics/examResults';
import { mergeKeptStatistics } from '#lib/analytics/keptStatistics';
import { buildStatisticsSnapshot, remapSnapshot, snapshotRecords } from '#lib/analytics/statisticsSnapshot';
import { rebuildAction } from '#lib/analytics/statisticsRebuild';
import type { ExamRecord, ExerciseRecord, ExerciseScoreRecord, SubmissionRecord } from '#lib/db/schema';

const exam = { id: 'exam-1', teacherId: 't', title: 'SA 1', lehrernachname: 'Muster', retentionUntil: '2027-01-01', compilationStatus: 'compiled', createdAt: '2026-01-01' } as ExamRecord;
const exercises = [
  { id: 'ex-a', name: 'A', maxPoints: 10, questionType: 'free_text', penalty: 0 },
  { id: 'ex-b', name: 'B', maxPoints: 4, questionType: 'mc', penalty: 0 },
] as ExerciseRecord[];
const submissions = [
  { id: 'sub-1', examId: 'exam-1', pseudonymHmac: 'p'.repeat(64), totalScore: 12, createdAt: '2026-02-01', scanCt: new Uint8Array([1]) },
  { id: 'sub-2', examId: 'exam-1', pseudonymHmac: 'q'.repeat(64), totalScore: 5, createdAt: '2026-02-02' },
  { id: 'sub-3', examId: 'exam-1', pseudonymHmac: 'r'.repeat(64), createdAt: '2026-02-03' },
] as SubmissionRecord[];
const scores = [
  { id: 's1', submissionId: 'sub-1', exerciseId: 'ex-a', score: 9 },
  { id: 's2', submissionId: 'sub-1', exerciseId: 'ex-b', score: 3, selectedOptions: [1], omrMeta: { confidence: 0.9 } },
  { id: 's3', submissionId: 'sub-2', exerciseId: 'ex-a', score: 5 },
] as ExerciseScoreRecord[];

describe('statistics snapshot', () => {
  it('holds no pseudonym, submission id, scan, OMR data or teacher name', () => {
    const snap = buildStatisticsSnapshot(exam, exercises, submissions, scores)!;
    const text = JSON.stringify(snap);
    for (const secret of ['p'.repeat(64), 'q'.repeat(64), 'sub-1', 'sub-2', 'confidence', 'Muster', 'scanCt']) {
      expect(text).not.toContain(secret);
    }
    expect(snap.rows).toHaveLength(2);
  });

  it('reproduces the exam statistics from the stand-in rows', () => {
    const live = computeExamResults(exam, exercises, submissions, scores).stats;
    const records = snapshotRecords(buildStatisticsSnapshot(exam, exercises, submissions, scores)!);
    const kept = computeExamResults(records.exam, records.exercises, records.submissions, records.scores).stats;
    expect(kept.summary).toEqual(live.summary);
    expect(kept.gradeBuckets).toEqual(live.gradeBuckets);
  });

  it('is null when nothing is graded, so it never replaces a kept record', () => {
    expect(buildStatisticsSnapshot(exam, exercises, [submissions[2]], [])).toBeNull();
  });

  it('follows an import id map', () => {
    const snap = remapSnapshot(buildStatisticsSnapshot(exam, exercises, submissions, scores)!, 'exam-2', (id) => `${id}-new`);
    expect(snap.exam.id).toBe('exam-2');
    expect(snap.exercises.map((ex) => ex.id)).toEqual(['ex-a-new', 'ex-b-new']);
    expect(snap.rows.every((row) => Object.keys(row.scores).every((id) => id.endsWith('-new')))).toBe(true);
  });

  it('counts a record only for exams without results here', () => {
    const snapshot = buildStatisticsSnapshot(exam, exercises, submissions, scores)!;
    const stored = [{ id: 'r1', examId: 'exam-1', keepAfterExamDelete: true, snapshot }];
    const input = { exams: [exam], exercises, examExercises: [], submissions, scores };
    expect(mergeKeptStatistics(input, stored).statsOnlyExamIds.size).toBe(0);
    const purged = mergeKeptStatistics({ ...input, exams: [], submissions: [], scores: [] }, stored);
    expect(purged.deletedExams).toHaveLength(1);
    expect(purged.submissions).toHaveLength(2);
  });
});

describe('rebuildAction', () => {
  const base = { local: true, purged: false, hasRows: true, graded: true, hadRows: true, clearWhenEmpty: true };

  it('never touches the record from a hybrid browser without results (regression: it was overwritten or deleted)', () => {
    expect(rebuildAction({ ...base, hasRows: false, graded: false, hadRows: false })).toBe('skip');
  });

  it('never touches the record of a server exam whose results retention erased (regression)', () => {
    expect(rebuildAction({ ...base, local: false, purged: true })).toBe('skip');
    expect(rebuildAction({ ...base, local: false, purged: true, hasRows: false, graded: false })).toBe('skip');
  });

  it('a hybrid purge stamp does not freeze the browser that still holds the results', () => {
    expect(rebuildAction({ ...base, purged: true })).toBe('put');
  });

  it('clears only after the teacher emptied the exam', () => {
    expect(rebuildAction({ ...base, hasRows: false, graded: false })).toBe('delete');
    expect(rebuildAction({ ...base, local: false, hasRows: false, graded: false, hadRows: false })).toBe('delete');
    expect(rebuildAction({ ...base, graded: false })).toBe('skip');
    expect(rebuildAction({ ...base, hasRows: false, graded: false, clearWhenEmpty: false })).toBe('skip');
  });
});
