/** The browser's trash for hybrid results (issue #125): what a local delete removed, kept as stored (still sealed) for the grace period. The server keeps its own trash; `trashService.ts` shows both as one. */
import { db } from '#lib/db/db';
import { decryptSubmission } from '#lib/db/dbEncryption';
import type { ExerciseScoreRecord, LocalTrashRecord, StudentRecord, SubmissionRecord } from '#lib/db/schema';
import type { RestoreResult } from './api';
import { joinKeys } from '#lib/crypto/pseudonymKey';
import { newTrashGroup, type DeleteOptions } from './group';

/** Mirrors the server's default RETENTION_GRACE_DAYS; the browser keeps its trash just as long. */
export const LOCAL_TRASH_DAYS = 7;
/** Days shown in delete confirmations ("you can restore it for N days"); the server's default grace period. */
export const TRASH_DAYS = LOCAL_TRASH_DAYS;
const DAY_MS = 86_400_000;

type Capture = Omit<LocalTrashRecord, 'id' | 'groupId' | 'deletedAt' | 'purgeAfter'>;

const hasTrash = () => typeof indexedDB !== 'undefined' && Boolean(db.trash);

/** Stores what a local delete is about to remove. Nothing for a permanent delete or an empty capture. */
export async function captureLocal(opts: DeleteOptions, entry: Capture): Promise<void> {
  if (opts.permanent || !hasTrash()) return;
  const rows = Object.fromEntries(
    Object.entries(entry.rows).filter(([, list]) => Array.isArray(list) && list.length > 0)
  ) as LocalTrashRecord['rows'];
  const cleared = entry.cleared?.filter(Boolean) ?? [];
  if (Object.keys(rows).length === 0 && cleared.length === 0) return;
  const now = Date.now();
  await db.trash.put({
    ...entry,
    rows,
    ...(cleared.length ? { cleared } : {}),
    id: crypto.randomUUID(),
    groupId: opts.group ?? newTrashGroup(),
    deletedAt: new Date(now).toISOString(),
    purgeAfter: new Date(now + LOCAL_TRASH_DAYS * DAY_MS).toISOString(),
  });
}

/** Stored rows (as sealed) of one submission and its scores. */
export async function storedSubmissionRows(id: string): Promise<{
  submissions: SubmissionRecord[];
  exerciseScores: ExerciseScoreRecord[];
}> {
  const sub = await db.submissions.get(id);
  return {
    submissions: sub ? [sub] : [],
    exerciseScores: await db.exerciseScores.where('submissionId').equals(id).toArray(),
  };
}

/** Stored rows of every result of one exam. */
export async function storedExamRows(examId: string): Promise<LocalTrashRecord['rows']> {
  const submissions = await db.submissions.where('examId').equals(examId).toArray();
  const ids = submissions.map((s) => s.id);
  return {
    examStudents: await db.examStudents.where('examId').equals(examId).toArray(),
    submissions,
    exerciseScores: ids.length ? await db.exerciseScores.where('submissionId').anyOf(ids).toArray() : [],
  };
}

/** Entries still within their grace period, newest first. */
export async function listLocalTrash(): Promise<LocalTrashRecord[]> {
  if (!hasTrash()) return [];
  const now = new Date().toISOString();
  const rows = await db.trash.where('purgeAfter').aboveOrEqual(now).toArray();
  return rows.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/** Erases entries past their grace period; run after the workspace opens. */
export async function sweepLocalTrash(): Promise<void> {
  if (!hasTrash()) return;
  await db.trash.where('purgeAfter').below(new Date().toISOString()).delete();
}

export async function purgeLocalGroup(groupId: string): Promise<void> {
  if (!hasTrash()) return;
  await db.trash.where('groupId').equals(groupId).delete();
}

function tally(result: RestoreResult, table: string): void {
  result.restored[table] = (result.restored[table] ?? 0) + 1;
}

async function restoreStudent(row: StudentRecord, result: RestoreResult): Promise<void> {
  if (await db.examStudents.get([row.examId, row.pseudonymHmac])) {
    result.skipped.push({ table: 'student_identities', id: row.pseudonymHmac, reason: 'already_exists' });
    return;
  }
  await db.examStudents.add(row);
  tally(result, 'student_identities');
}

async function restoreSubmission(row: SubmissionRecord, result: RestoreResult): Promise<void> {
  if (await db.submissions.get(row.id)) {
    result.skipped.push({ table: 'scan_submissions', id: row.id, reason: 'already_exists' });
    return;
  }
  await db.submissions.add(row);
  tally(result, 'scan_submissions');
}

async function restoreScore(row: ExerciseScoreRecord, result: RestoreResult): Promise<void> {
  if (!(await db.submissions.get(row.submissionId))) {
    result.skipped.push({ table: 'exercise_scores', id: row.id, reason: 'parent_missing' });
    return;
  }
  const taken = await db.exerciseScores
    .where('submissionId')
    .equals(row.submissionId)
    .and((s) => s.id === row.id || s.exerciseId === row.exerciseId)
    .count();
  if (taken > 0) {
    result.skipped.push({ table: 'exercise_scores', id: row.id, reason: 'already_exists' });
    return;
  }
  await db.exerciseScores.add(row);
  tally(result, 'exercise_scores');
}

/** Puts a cleared submission back only while it is still cleared: grading added since is never overwritten. */
async function refill(row: SubmissionRecord, key: CryptoKey | null, result: RestoreResult): Promise<void> {
  const live = await db.submissions.get(row.id);
  if (!live) {
    result.skipped.push({ table: 'scan_submissions', id: row.id, reason: 'gone' });
    return;
  }
  const current = await decryptSubmission(live, key);
  if (current.decryptFailed || current.totalScore !== undefined || current.annotationCt) {
    result.skipped.push({ table: 'scan_submissions', id: row.id, reason: 'changed_since' });
    return;
  }
  // Same id, so the row-bound AAD of the stored ciphertext still holds.
  await db.submissions.put(row);
  tally(result, 'scan_submissions');
}

/** Restores one group's local entries: missing rows only, parents first; the entries leave the trash. */
export async function restoreLocalGroup(
  groupId: string,
  key: CryptoKey | null,
  examExists: (examId: string) => Promise<boolean>
): Promise<RestoreResult> {
  const result: RestoreResult = { restored: {}, skipped: [] };
  if (!hasTrash()) return result;
  const items = await db.trash.where('groupId').equals(groupId).toArray();
  const live = new Map<string, boolean>();
  for (const item of items) {
    if (!live.has(item.examId)) live.set(item.examId, await examExists(item.examId));
  }
  const usable = items.filter((item) => {
    if (live.get(item.examId)) return true;
    result.skipped.push({ table: 'exams', id: item.examId, reason: 'parent_missing' });
    return false;
  });
  for (const item of usable) for (const row of item.rows.examStudents ?? []) await restoreStudent(row, result);
  for (const item of usable) for (const row of item.rows.submissions ?? []) await restoreSubmission(row, result);
  for (const item of usable) for (const row of item.rows.exerciseScores ?? []) await restoreScore(row, result);
  for (const item of usable) for (const row of item.cleared ?? []) await refill(row, key, result);
  await db.trash.bulkDelete(items.map((item) => item.id));
  return result;
}

/** GDPR erasure: drops every row of one student (compared by join key) from this browser's trash. */
export async function purgeLocalStudent(examId: string, target: string): Promise<void> {
  if (!hasTrash()) return;
  const items = (await db.trash.toArray()).filter((item) => item.examId === examId);
  for (const item of items) {
    const students = item.rows.examStudents ?? [];
    const subs = [...(item.rows.submissions ?? []), ...(item.cleared ?? [])];
    const studentKeys = await joinKeys(students);
    const subKeys = await joinKeys(subs);
    const erasedSubs = new Set(subs.filter((_, i) => subKeys[i] === target).map((s) => s.id));
    if (erasedSubs.size === 0 && !studentKeys.includes(target)) continue;
    const rows: LocalTrashRecord['rows'] = {
      examStudents: students.filter((_, i) => studentKeys[i] !== target),
      submissions: (item.rows.submissions ?? []).filter((s) => !erasedSubs.has(s.id)),
      exerciseScores: (item.rows.exerciseScores ?? []).filter((s) => !erasedSubs.has(s.submissionId)),
    };
    const cleared = (item.cleared ?? []).filter((s) => !erasedSubs.has(s.id));
    const left = Object.values(rows).some((list) => list && list.length > 0) || cleared.length > 0;
    if (left) await db.trash.put({ ...item, rows, cleared });
    else await db.trash.delete(item.id);
  }
}
