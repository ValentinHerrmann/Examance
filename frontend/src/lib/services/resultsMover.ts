/**
 * Fluent storage-mode change: moves the grading results (students, submissions with their scans,
 * per-exercise scores) between the server and this browser in place. Exams and exercises stay on the
 * server in both modes, and both sides seal under the same account data key, so nothing is
 * re-encrypted; rows only change shape.
 *
 * Every write is an idempotent upsert (students by pseudonym, submissions by id, scores by
 * submission+exercise), so an interrupted move is simply run again. The account's mode changes only
 * after every exam's results arrived and the counts were verified; deleting the old copy is a
 * separate, optional last step. Strategy: docs/dev/storage_modes.md.
 */

import { get, writable } from 'svelte/store';
import { api, ApiError } from '#lib/api/client';
import { db } from '#lib/db/db';
import {
  decryptScore,
  decryptStudent,
  decryptSubmission,
  encryptScore,
  encryptStudent,
  encryptSubmission,
} from '#lib/db/dbEncryption';
import type { ExerciseScoreRecord, StudentRecord, SubmissionRecord } from '#lib/db/schema';
import { applyMode, rememberMode } from '#lib/db/workspace';
import { mapApiToStudentRecord, studentServerPayload } from '#lib/repositories/studentRepository';
import { mapApiToSubmissionRecord, submissionServerPayload } from '#lib/repositories/submissionRepository';
import { fromApi as scoreFromApi, toApi as scoreToApi } from '#lib/repositories/scoreRepository';
import { saveAccountStorageMode } from '#lib/stores/capabilities';
import { sessionStore } from '#lib/stores/session';
import type { StorageMode } from '#lib/stores/storagePolicy';
import { flushOfflineQueue } from '#lib/services/offlineQueue';
import { announceModeChange, beginModeSwitch, finishModeSwitch } from '#lib/services/storageModeSwitch';

export type MoveDirection = 'to-browser' | 'to-server';

export interface MoveProgress {
  direction: MoveDirection;
  examsDone: number;
  examsTotal: number;
  students: number;
  submissions: number;
  scores: number;
}

export const moveProgressStore = writable<MoveProgress | null>(null);

export interface MoveResult {
  students: number;
  submissions: number;
  scores: number;
  /** Exams whose results could not be moved (e.g. the exam no longer exists on the server). */
  skippedExams: string[];
}

export class MoveVerificationError extends Error {
  constructor(public examId: string, what: string) {
    super(`Results of exam ${examId} did not all arrive (${what}). Nothing was switched; run the move again.`);
    this.name = 'MoveVerificationError';
  }
}

/** Moving to `hybrid` brings results into this browser; moving to `all-server` takes them to the server. */
export function directionFor(to: StorageMode): MoveDirection {
  return to === 'hybrid' ? 'to-browser' : 'to-server';
}

interface ExamResults {
  students: StudentRecord[];
  submissions: SubmissionRecord[];
  scores: ExerciseScoreRecord[];
}

function key(): CryptoKey {
  const k = get(sessionStore).sessionKey;
  if (!k) throw new Error('The session is locked.');
  return k;
}

// ---------------------------------------------------------------------------------------------------
// Reading each side (decrypted records)
// ---------------------------------------------------------------------------------------------------

async function readServer(examId: string): Promise<ExamResults> {
  const k = key();
  const [rawStudents, rawSubmissions, rawScores] = await Promise.all([
    api.get<any[]>(`/exams/${examId}/students`, { silentError: true }),
    api.get<any[]>(`/exams/${examId}/submissions?include_scans=true`, { silentError: true }),
    api.get<any[]>(`/exams/${examId}/scores`, { silentError: true }),
  ]);
  return {
    students: await Promise.all(rawStudents.map((s) => decryptStudent(mapApiToStudentRecord(s, examId), k))),
    // Server submissions carry the scan sealed and the total in plaintext: already "decrypted" shape.
    submissions: rawSubmissions.map((s) => mapApiToSubmissionRecord(s, examId)),
    scores: await Promise.all(rawScores.map((s) => decryptScore(scoreFromApi(s), k))),
  };
}

async function readLocal(examId: string): Promise<ExamResults> {
  const k = key();
  const students = await db.students.where('examId').equals(examId).toArray();
  const submissions = await db.submissions.where('examId').equals(examId).toArray();
  const scores = await db.exerciseScores.where('submissionId').anyOf(submissions.map((s) => s.id)).toArray();
  return {
    students: await Promise.all(students.map((s) => decryptStudent(s, k))),
    submissions: await Promise.all(submissions.map((s) => decryptSubmission(s, k))),
    scores: await Promise.all(scores.map((s) => decryptScore(s, k))),
  };
}

function assertReadable(results: ExamResults): void {
  // Never carry a record that would not open: re-sealing it would replace real data with blanks.
  const broken = [...results.students, ...results.submissions, ...results.scores].some((r) => r.decryptFailed);
  if (broken) throw new Error('Some results could not be decrypted with this account key; nothing was moved.');
}

// ---------------------------------------------------------------------------------------------------
// Writing each side
// ---------------------------------------------------------------------------------------------------

async function writeLocal(results: ExamResults): Promise<void> {
  const k = key();
  const students = await Promise.all(results.students.map((s) => encryptStudent(s, k)));
  const submissions = await Promise.all(results.submissions.map((s) => encryptSubmission(s, k)));
  const scores = await Promise.all(results.scores.map((s) => encryptScore(s, k)));
  await db.transaction('rw', [db.students, db.submissions, db.exerciseScores], async () => {
    await db.students.bulkPut(students);
    await db.submissions.bulkPut(submissions);
    // Rows are identified by (submission, exercise) in both stores: keep a local row's id when one exists.
    for (const row of scores) {
      const existing = await db.exerciseScores
        .where('submissionId')
        .equals(row.submissionId)
        .and((r) => r.exerciseId === row.exerciseId)
        .first();
      await db.exerciseScores.put({ ...row, id: existing?.id ?? row.id });
    }
  });
}

async function writeServer(examId: string, results: ExamResults): Promise<void> {
  const k = key();
  for (const student of results.students) {
    await api.post(`/exams/${examId}/students`, await studentServerPayload(student, k), { silentError: true });
  }
  for (const submission of results.submissions) {
    await api.post(`/exams/${examId}/submissions`, await submissionServerPayload(submission), { silentError: true });
  }
  const bySubmission = new Map<string, ExerciseScoreRecord[]>();
  for (const score of results.scores) {
    bySubmission.set(score.submissionId, [...(bySubmission.get(score.submissionId) ?? []), score]);
  }
  for (const [submissionId, scores] of bySubmission) {
    const sealed = await Promise.all(scores.map((s) => encryptScore(s, k)));
    await api.put(
      `/exams/${examId}/submissions/${submissionId}/scores`,
      { scores: sealed.map(scoreToApi) },
      { silentError: true }
    );
  }
}

async function verify(examId: string, sent: ExamResults, direction: MoveDirection): Promise<void> {
  const arrived = direction === 'to-browser' ? await readLocal(examId) : await readServer(examId);
  if (arrived.submissions.length < sent.submissions.length) throw new MoveVerificationError(examId, 'submissions');
  if (arrived.scores.length < sent.scores.length) throw new MoveVerificationError(examId, 'scores');
  if (arrived.students.length < sent.students.length) throw new MoveVerificationError(examId, 'students');
}

/** Exams whose results this move must carry. */
async function examIdsToMove(direction: MoveDirection): Promise<string[]> {
  if (direction === 'to-browser') {
    const exams = await api.get<{ id: string }[]>('/exams', { silentError: true });
    return exams.map((e) => e.id);
  }
  const ids = new Set<string>();
  (await db.students.toArray()).forEach((s) => ids.add(s.examId));
  (await db.submissions.toArray()).forEach((s) => ids.add(s.examId));
  return [...ids];
}

/** True when the move has anything to carry (decides whether the choice dialog must move at all). */
export async function hasResultsToMove(direction: MoveDirection): Promise<boolean> {
  if (direction === 'to-server') return (await db.submissions.count()) + (await db.students.count()) > 0;
  const examIds = await examIdsToMove('to-browser');
  for (const examId of examIds) {
    const subs = await api.get<any[]>(`/exams/${examId}/submissions`, { silentError: true });
    if (subs.length > 0) return true;
  }
  return false;
}

/**
 * Moves every exam's results towards `to`'s home, verifies them, then records `to` as the account's
 * mode (compare-and-set on `from`). The source copy is left in place; `deleteOldCopy` removes it.
 * @throws MoveVerificationError or ApiError; the account's mode is unchanged then.
 */
export async function moveResults(from: StorageMode | null, to: StorageMode): Promise<MoveResult> {
  const direction = directionFor(to);
  await flushOfflineQueue();
  beginModeSwitch(from, to);
  try {
    const examIds = await examIdsToMove(direction);
    const result: MoveResult = { students: 0, submissions: 0, scores: 0, skippedExams: [] };
    moveProgressStore.set({ direction, examsDone: 0, examsTotal: examIds.length, students: 0, submissions: 0, scores: 0 });

    for (const examId of examIds) {
      let results: ExamResults;
      try {
        results = direction === 'to-browser' ? await readServer(examId) : await readLocal(examId);
      } catch (err) {
        // An exam deleted meanwhile has nothing to move; anything else (an expired session) aborts.
        if (err instanceof ApiError && err.status === 404) {
          result.skippedExams.push(examId);
          continue;
        }
        throw err;
      }
      assertReadable(results);
      if (direction === 'to-browser') await writeLocal(results);
      else {
        try {
          await writeServer(examId, results);
        } catch (err) {
          // Local results of an exam the server no longer knows: nothing to attach them to.
          if (err instanceof ApiError && err.status === 404) {
            result.skippedExams.push(examId);
            continue;
          }
          throw err;
        }
      }
      await verify(examId, results, direction);
      result.students += results.students.length;
      result.submissions += results.submissions.length;
      result.scores += results.scores.length;
      moveProgressStore.update((p) => p && {
        ...p,
        examsDone: p.examsDone + 1,
        students: result.students,
        submissions: result.submissions,
        scores: result.scores,
      });
    }

    await saveAccountStorageMode(to, from);
    applyMode(to);
    await rememberMode(to);
    announceModeChange();
    return result;
  } finally {
    finishModeSwitch();
  }
}

/**
 * Optional last step: removes the copy the move left behind. Towards the browser that is the server's
 * student data (`POST /user/purge-server-student-data`, soft delete with a 7-day grace period);
 * towards the server it is this browser's result tables, cleared in one transaction.
 */
export async function deleteOldCopy(direction: MoveDirection): Promise<{ students: number; submissions: number }> {
  if (direction === 'to-browser') {
    const res = await api.post<{ purged_student_identities: number; purged_submissions: number }>(
      '/user/purge-server-student-data',
      undefined,
      { silentError: true }
    );
    return { students: res.purged_student_identities, submissions: res.purged_submissions };
  }
  const counts = { students: await db.students.count(), submissions: await db.submissions.count() };
  await db.transaction('rw', [db.students, db.submissions, db.exerciseScores], async () => {
    await Promise.all([db.students.clear(), db.submissions.clear(), db.exerciseScores.clear()]);
  });
  return counts;
}
