/**
 * The one score-save path of every grading view (M2): grade page, both manual grids and the paste import.
 * Rows go through `scoreRepository`, the total through `submissionRepository`, so both follow the storage mode.
 */
import { get } from 'svelte/store';
import { api } from '#lib/api/client';
import type { ExerciseScoreRecord, OmrScoreMeta, StudentRecord, SubmissionRecord } from '#lib/db/schema';
import { scoreRepository } from '#lib/repositories/scoreRepository';
import { studentRepository } from '#lib/repositories/studentRepository';
import { submissionRepository } from '#lib/repositories/submissionRepository';
import { enqueueOrThrow } from '#lib/services/offlineQueue';
import { sessionStore } from '#lib/stores/session';
import { resultsAreLocal } from '#lib/stores/storagePolicy';

/** Live MC state of the grade page; other views carry the stored row's values forward. */
export interface McCarry {
  selectedOptions?: number[];
  omrMeta?: OmrScoreMeta;
}

/**
 * Saves `values` (exercise id -> score; `null` clears, a missing id stays as it is) and the submission's total,
 * which is set only when every exercise of `exerciseIds` has a score. Never deletes a row carrying OMR data or one
 * that failed to decrypt: both only look ungraded (frontend `CLAUDE.md`). Returns the effective score per exercise.
 */
export async function saveSubmissionScores(
  examId: string,
  submission: SubmissionRecord,
  exerciseIds: readonly string[],
  values: ReadonlyMap<string, number | null>,
  opts: {
    mc?: Readonly<Record<string, McCarry | undefined>>;
    existing?: ReadonlyMap<string, ExerciseScoreRecord>;
    clearAnnotations?: boolean;
  } = {},
): Promise<Map<string, number | null>> {
  const key = get(sessionStore).sessionKey;
  const existing =
    opts.existing ??
    new Map((await scoreRepository.getBySubmissionId(examId, submission.id, key)).map((r) => [r.exerciseId, r]));

  const toSave: ExerciseScoreRecord[] = [];
  const toClear: string[] = [];
  const effective = new Map<string, number | null>();
  for (const exerciseId of exerciseIds) {
    const row = existing.get(exerciseId);
    if (!values.has(exerciseId)) {
      effective.set(exerciseId, row?.score ?? null);
      continue;
    }
    const value = values.get(exerciseId);
    if (typeof value === 'number' && !Number.isNaN(value)) {
      const mc = opts.mc?.[exerciseId];
      toSave.push({
        id: crypto.randomUUID(),
        submissionId: submission.id,
        exerciseId,
        score: value,
        selectedOptions: mc?.selectedOptions ?? row?.selectedOptions,
        omrMeta: mc?.omrMeta ?? row?.omrMeta,
      });
      effective.set(exerciseId, value);
    } else if (row?.omrMeta || row?.decryptFailed) {
      effective.set(exerciseId, row.score ?? null);
    } else {
      toClear.push(exerciseId);
      effective.set(exerciseId, null);
    }
  }

  await scoreRepository.saveMany(examId, submission.id, toSave, key);
  for (const exerciseId of toClear) {
    await scoreRepository.deleteOne(examId, submission.id, exerciseId);
  }

  const scores = [...effective.values()];
  const fullyGraded = exerciseIds.length > 0 && scores.every((s) => typeof s === 'number');
  submission.totalScore = fullyGraded
    ? Math.round(scores.reduce((sum: number, s) => sum + (s ?? 0), 0) * 100) / 100
    : undefined;
  await submissionRepository.save(submission, key, { clearAnnotations: opts.clearAnnotations });
  // The upsert above only ever sets a total; clearing one needs its own request.
  if (!resultsAreLocal() && submission.totalScore === undefined) {
    const url = `/exams/${examId}/submissions/${submission.id}/score`;
    try {
      await api.patch(url, { total_score: null }, { silentError: true });
    } catch (err) {
      enqueueOrThrow(err, url, 'PATCH', { total_score: null });
    }
  }
  return effective;
}

/** A roster entry: the student (identity sealed by the repository) plus the empty submission grading attaches to. */
export async function createStudentWithSubmission(
  examId: string,
  identity: Pick<StudentRecord, 'studentName' | 'studentNumber' | 'fallbackCode'>,
): Promise<{ student: StudentRecord; submission: SubmissionRecord }> {
  const key = get(sessionStore).sessionKey;
  const pseudonymId = crypto.randomUUID();
  const student: StudentRecord = {
    pseudonymId,
    examId,
    ...identity,
    piiCt: new Uint8Array(0),
    piiIv: new Uint8Array(12),
  };
  await studentRepository.save(student, key);
  const submission: SubmissionRecord = {
    id: crypto.randomUUID(),
    examId,
    pseudonymHash: pseudonymId,
    createdAt: new Date().toISOString(),
  };
  await submissionRepository.save(submission, key);
  return { student, submission };
}
