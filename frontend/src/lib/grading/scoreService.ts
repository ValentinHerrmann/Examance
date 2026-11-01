/** The one score-save path of every grading view (M2): grade page, both manual grids and the paste import. Rows go through `scoreRepository`, the total through `submissionRepository`, so both follow the storage mode. */
import { newTrashGroup } from '#lib/trash/group';
import { get } from 'svelte/store';
import { api } from '#lib/api/client';
import type { ExerciseScoreRecord, OmrScoreMeta, StudentRecord, SubmissionRecord } from '#lib/db/schema';
import { scoreRepository } from '#lib/repositories/scoreRepository';
import { pseudonymFor } from '#lib/services/pseudonymRekey';
import { studentRepository } from '#lib/repositories/studentRepository';
import { submissionRepository } from '#lib/repositories/submissionRepository';
import { enqueueOrThrow } from '#lib/services/offlineQueue';
import { sessionStore } from '#lib/stores/session';
import { resultsAreLocal } from '#lib/stores/storagePolicy';
import { hasPartValues, type PartScores } from '#lib/grading/partScores';

/** Live MC state of the grade page; other views carry the stored row's values forward. */
export interface McCarry {
  selectedOptions?: number[];
  omrMeta?: OmrScoreMeta;
}

type SaveOpts = {
  mc?: Readonly<Record<string, McCarry | undefined>>;
  existing?: ReadonlyMap<string, ExerciseScoreRecord>;
  clearAnnotations?: boolean;
  /** Live part scores of the grade page. Other views keep the stored parts while the total is unchanged and drop them when it was overridden. */
  parts?: Readonly<Record<string, PartScores | undefined>>;
};

/** What a save does with one exercise: write `row`, delete the stored row, or keep it; `effective` is the score it ends up with. */
type RowPlan = { row?: ExerciseScoreRecord; clear?: boolean; effective: number | null };

/** Stored parts belong to the stored total: a total changed elsewhere (score grid, paste import) drops them. */
function storedParts(row: ExerciseScoreRecord | undefined, score: number | undefined): PartScores | undefined {
  return row?.score === score ? row?.partScores : undefined;
}

function planRow(
  submissionId: string,
  exerciseId: string,
  row: ExerciseScoreRecord | undefined,
  value: number | null | undefined,
  opts: SaveOpts,
): RowPlan {
  const score = typeof value === 'number' && !Number.isNaN(value) ? value : undefined;
  const parts = opts.parts ? opts.parts[exerciseId] : storedParts(row, score);
  const keptParts = hasPartValues(parts) ? parts : undefined;
  // A partly graded exercise is stored with its parts but without a score.
  if (score !== undefined || (opts.parts && keptParts)) {
    const mc = opts.mc?.[exerciseId];
    return {
      row: {
        id: crypto.randomUUID(),
        submissionId,
        exerciseId,
        score,
        selectedOptions: mc?.selectedOptions ?? row?.selectedOptions,
        omrMeta: mc?.omrMeta ?? row?.omrMeta,
        partScores: keptParts,
      },
      effective: score ?? null,
    };
  }
  if (row?.omrMeta || row?.decryptFailed || keptParts) return { effective: row?.score ?? null };
  return { clear: true, effective: null };
}

/** The total of a fully graded submission; undefined while any exercise lacks a score. */
function totalOf(scores: (number | null)[]): number | undefined {
  if (scores.length === 0 || !scores.every((s) => typeof s === 'number')) return undefined;
  return Math.round(scores.reduce((sum: number, s) => sum + (s ?? 0), 0) * 100) / 100;
}

/** Saves `values` (exercise id -> score; `null` clears, a missing id stays as it is) and the submission's total, which is set only when every exercise of `exerciseIds` has a score. Never deletes a row carrying OMR data, part scores of a partly graded exercise, or one that failed to decrypt: they only look ungraded (frontend `CLAUDE.md`). Returns the effective score per exercise. */
export async function saveSubmissionScores(
  examId: string,
  submission: SubmissionRecord,
  exerciseIds: readonly string[],
  values: ReadonlyMap<string, number | null>,
  opts: SaveOpts = {},
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
    const plan: RowPlan = values.has(exerciseId)
      ? planRow(submission.id, exerciseId, row, values.get(exerciseId), opts)
      : { effective: row?.score ?? null };
    if (plan.row) toSave.push(plan.row);
    if (plan.clear) toClear.push(exerciseId);
    effective.set(exerciseId, plan.effective);
  }

  await scoreRepository.saveMany(examId, submission.id, toSave, key);
  // Cleared scores and annotations of one save are one trash entry (issue #125).
  const group = newTrashGroup();
  await Promise.all(toClear.map((exerciseId) => scoreRepository.deleteOne(examId, submission.id, exerciseId, { group })));

  submission.totalScore = totalOf([...effective.values()]);
  await submissionRepository.save(submission, key, { clearAnnotations: opts.clearAnnotations, group });
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
  const pseudonym = await pseudonymFor(examId, crypto.randomUUID());
  const student: StudentRecord = {
    ...pseudonym,
    examId,
    ...identity,
    piiCt: new Uint8Array(0),
    piiIv: new Uint8Array(12),
  };
  await studentRepository.save(student, key);
  const submission: SubmissionRecord = {
    id: crypto.randomUUID(),
    examId,
    pseudonymHmac: pseudonym.pseudonymHmac,
    pseudonymVersion: pseudonym.pseudonymVersion,
    createdAt: new Date().toISOString(),
  };
  await submissionRepository.save(submission, key);
  return { student, submission };
}
