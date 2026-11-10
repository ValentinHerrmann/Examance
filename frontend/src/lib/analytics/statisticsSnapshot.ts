/** Anonymised statistics of one exam (issue #238, docs/dev/statistics_snapshots.md): an unlinked, shuffled score matrix that outlives the results. The one builder and reader of the payload. */
import type { ExamRecord, ExerciseRecord, ExerciseScoreRecord, SubmissionRecord } from '#lib/db/schema';

export const STATISTICS_SNAPSHOT_VERSION = 1;

/** Exam fields kept so the record still reads after the exam is gone; never a name of a person (no `lehrernachname`). */
const EXAM_FIELDS = ['title', 'testart', 'grade', 'klasse', 'course', 'datum', 'nr', 'fach', 'topic', 'numVersions', 'gradingKey'] as const;
const EXERCISE_FIELDS = ['name', 'title', 'maxPoints', 'questionType', 'penalty', 'variantKey', 'exerciseGroupId', 'topicTag', 'subject', 'grade'] as const;

export type SnapshotExam = Pick<ExamRecord, 'id' | (typeof EXAM_FIELDS)[number]>;
export type SnapshotExercise = Pick<ExerciseRecord, 'id' | (typeof EXERCISE_FIELDS)[number]>;

/** One graded paper: no submission id, pseudonym, scan, ink, OMR data or time. */
export interface SnapshotRow {
  total: number | null;
  scores: Record<string, number>;
  mc?: Record<string, number[]>;
}

export interface StatisticsSnapshot {
  v: typeof STATISTICS_SNAPSHOT_VERSION;
  computedAt: string;
  exam: SnapshotExam;
  exercises: SnapshotExercise[];
  rows: SnapshotRow[];
}

function pick<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (source[k] !== undefined && source[k] !== null) out[k] = source[k];
  return out;
}

/** Fisher-Yates with crypto randomness, so row order says nothing about scan or class-list order. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  const rand = new Uint32Array(1);
  for (let i = out.length - 1; i > 0; i--) {
    crypto.getRandomValues(rand);
    const j = rand[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v);

/** The exam's scores per submission, limited to its own exercises. */
function scoresBySubmission(scores: ExerciseScoreRecord[], known: Set<string>): Map<string, ExerciseScoreRecord[]> {
  const out = new Map<string, ExerciseScoreRecord[]>();
  for (const sc of scores) {
    if (!known.has(sc.exerciseId)) continue;
    const list = out.get(sc.submissionId);
    if (list) list.push(sc);
    else out.set(sc.submissionId, [sc]);
  }
  return out;
}

/** One paper's row without anything that links it to the student; null when nothing on it is graded. */
function rowOf(sub: SubmissionRecord, scores: ExerciseScoreRecord[]): SnapshotRow | null {
  const total = isNumber(sub.totalScore) ? sub.totalScore : null;
  const points: Record<string, number> = {};
  const mc: Record<string, number[]> = {};
  for (const sc of scores) {
    if (isNumber(sc.score)) points[sc.exerciseId] = sc.score;
    if (sc.selectedOptions?.length) mc[sc.exerciseId] = [...sc.selectedOptions];
  }
  if (total === null && Object.keys(points).length === 0) return null;
  return Object.keys(mc).length > 0 ? { total, scores: points, mc } : { total, scores: points };
}

/** The exam's record, or null when nothing is graded (an empty record must never replace a kept one). */
export function buildStatisticsSnapshot(
  exam: ExamRecord,
  exercises: ExerciseRecord[],
  submissions: SubmissionRecord[],
  scores: ExerciseScoreRecord[],
  now: Date = new Date(),
): StatisticsSnapshot | null {
  const bySubmission = scoresBySubmission(scores, new Set(exercises.map((ex) => ex.id)));
  const rows = submissions
    .filter((sub) => sub.examId === exam.id)
    .map((sub) => rowOf(sub, bySubmission.get(sub.id) ?? []))
    .filter((row): row is SnapshotRow => row !== null);
  if (rows.length === 0) return null;
  return {
    v: STATISTICS_SNAPSHOT_VERSION,
    computedAt: now.toISOString(),
    exam: { id: exam.id, ...pick(exam, EXAM_FIELDS) },
    exercises: exercises.map((ex) => ({ id: ex.id, ...pick(ex, EXERCISE_FIELDS) })),
    rows: shuffle(rows),
  };
}

export interface SnapshotRecords {
  exam: ExamRecord;
  exercises: ExerciseRecord[];
  submissions: SubmissionRecord[];
  scores: ExerciseScoreRecord[];
}

/** The record as stand-in rows (ids `stats:<exam>:<n>`), so every existing statistics function reads it unchanged. */
export function snapshotRecords(snapshot: StatisticsSnapshot): SnapshotRecords {
  const examId = snapshot.exam.id;
  const submissions: SubmissionRecord[] = [];
  const scores: ExerciseScoreRecord[] = [];
  snapshot.rows.forEach((row, i) => {
    const id = `stats:${examId}:${i}`;
    submissions.push({ id, examId, pseudonymHmac: id, createdAt: snapshot.computedAt, ...(row.total === null ? {} : { totalScore: row.total }) });
    for (const [exerciseId, score] of Object.entries(row.scores)) {
      scores.push({ id: `${id}:${exerciseId}`, submissionId: id, exerciseId, score, ...(row.mc?.[exerciseId] ? { selectedOptions: row.mc[exerciseId] } : {}) });
    }
  });
  return {
    exam: { retentionUntil: '', compilationStatus: 'compiled', createdAt: snapshot.computedAt, ...snapshot.exam, teacherId: '' },
    exercises: snapshot.exercises.map((ex) => ({ ...ex, maxPoints: ex.maxPoints ?? 0, penalty: ex.penalty ?? 0, examId })),
    submissions,
    scores,
  };
}

/** The record moved onto an imported exam: its exam and exercise ids follow the import's id map. */
export function remapSnapshot(snapshot: StatisticsSnapshot, examId: string, remapId: (id: string) => string): StatisticsSnapshot {
  const remapKeys = <T>(map: Record<string, T>) => Object.fromEntries(Object.entries(map).map(([id, v]) => [remapId(id), v]));
  return {
    ...snapshot,
    exam: { ...snapshot.exam, id: examId },
    exercises: snapshot.exercises.map((ex) => ({ ...ex, id: remapId(ex.id) })),
    rows: snapshot.rows.map((row) => ({ ...row, scores: remapKeys(row.scores), ...(row.mc ? { mc: remapKeys(row.mc) } : {}) })),
  };
}

/** Whether a stand-in row came from a record (no grading view, no student behind it). */
export const isSnapshotSubmissionId = (id: string) => id.startsWith('stats:');
