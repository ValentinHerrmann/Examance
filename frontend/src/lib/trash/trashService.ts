/** The Trash page's model (issue #125): server and browser entries merged by group, labelled for display, restored and erased together. */
import { markStatisticsDirty } from '#lib/analytics/statisticsDirty';
import { get } from 'svelte/store';
import { sessionStore } from '#lib/stores/session';
import { resultsAreLocal } from '#lib/stores/storagePolicy';
import { decryptStudent } from '#lib/db/dbEncryption';
import type { LocalTrashRecord, StudentRecord } from '#lib/db/schema';
import { examRepository } from '#lib/repositories/examRepository';
import { mapApiToStudentRecord } from '#lib/repositories/studentRepository';
import { listServerTrash, purgeServerGroup, restoreServerGroup, type RestoreResult, type ServerTrashEntry, type ServerTrashList } from './api';
import { listLocalTrash, purgeLocalGroup, restoreLocalGroup, sweepLocalTrash, LOCAL_TRASH_DAYS } from './localTrash';

export interface TrashItemView {
  id: string;
  kind: string;
  /** Held in this browser (hybrid results) rather than on the server. */
  local: boolean;
  examId?: string;
  examTitle?: string;
  exerciseName?: string;
  filename?: string;
  /** Decrypted name or fallback code; a short pseudonym when the identity is not in the entry. */
  student?: string;
  counts: Record<string, number>;
}

export interface TrashGroupView {
  groupId: string;
  deletedAt: string;
  purgeAfter: string;
  items: TrashItemView[];
  hasServer: boolean;
  hasLocal: boolean;
}

export interface TrashView {
  graceDays: number;
  groups: TrashGroupView[];
}

async function studentName(record: StudentRecord | undefined, key: CryptoKey | null): Promise<string | undefined> {
  if (!record?.payloadCt) return undefined;
  const open = await decryptStudent(record, key);
  if (open.decryptFailed) return undefined;
  return open.studentName || open.fallbackCode || undefined;
}

const shortPseudonym = (hmac: unknown) => (typeof hmac === 'string' && hmac ? `#${hmac.slice(0, 4).toUpperCase()}` : undefined);

async function serverItem(entry: ServerTrashEntry, key: CryptoKey | null): Promise<TrashItemView> {
  const label = entry.label ?? {};
  const identity = label.pii_ciphertext_b64 ? mapApiToStudentRecord(label, label.exam_id) : undefined;
  return {
    id: entry.id,
    kind: entry.kind,
    local: false,
    examId: label.exam_id ?? undefined,
    examTitle: label.exam_title ?? undefined,
    exerciseName: label.exercise_name ?? undefined,
    filename: label.filename ?? undefined,
    student: (await studentName(identity, key)) ?? shortPseudonym(label.pseudonym_hmac),
    counts: label.counts ?? {},
  };
}

async function localItem(entry: LocalTrashRecord, titles: Map<string, string>, key: CryptoKey | null): Promise<TrashItemView> {
  const counts: Record<string, number> = {};
  if (entry.rows.examStudents?.length) counts.student_identities = entry.rows.examStudents.length;
  if (entry.rows.submissions?.length) counts.scan_submissions = entry.rows.submissions.length;
  if (entry.rows.exerciseScores?.length) counts.exercise_scores = entry.rows.exerciseScores.length;
  if (entry.cleared?.length) counts.scan_submissions = (counts.scan_submissions ?? 0) + entry.cleared.length;
  const single = entry.kind === 'exam' ? undefined : entry.rows.examStudents?.[0];
  return {
    id: entry.id,
    kind: entry.kind,
    local: true,
    examId: entry.examId,
    examTitle: titles.get(entry.examId),
    student: (await studentName(single, key)) ?? shortPseudonym(entry.pseudonymHmac),
    counts,
  };
}

/** Exam titles for browser entries, which carry none: their exams are live or in the server trash. */
async function examTitles(server: ServerTrashList, key: CryptoKey | null): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  for (const exam of await examRepository.getAll(key)) if (exam.id) titles.set(exam.id, exam.title ?? '');
  for (const entry of server.groups.flatMap((group) => group.entries)) {
    if (entry.kind === 'exam' && entry.label?.exam_id) titles.set(entry.label.exam_id, entry.label.exam_title);
  }
  return titles;
}

/** Both trashes, newest group first. Old browser entries are swept first. */
export async function loadTrash(): Promise<TrashView> {
  await sweepLocalTrash();
  const key = get(sessionStore).sessionKey;
  const [server, local] = await Promise.all([listServerTrash(), listLocalTrash()]);
  const titles = local.length ? await examTitles(server, key) : new Map<string, string>();
  const [serverItems, localItems] = await Promise.all([
    Promise.all(server.groups.map((g) => Promise.all(g.entries.map((entry) => serverItem(entry, key))))),
    Promise.all(local.map((entry) => localItem(entry, titles, key))),
  ]);

  const groups = new Map<string, TrashGroupView>();
  const groupOf = (groupId: string, deletedAt: string, purgeAfter: string) => {
    let group = groups.get(groupId);
    if (!group) {
      group = { groupId, deletedAt, purgeAfter, items: [], hasServer: false, hasLocal: false };
      groups.set(groupId, group);
    }
    if (deletedAt > group.deletedAt) group.deletedAt = deletedAt;
    if (purgeAfter < group.purgeAfter) group.purgeAfter = purgeAfter;
    return group;
  };
  server.groups.forEach((g, i) => {
    const group = groupOf(g.group_id, g.deleted_at, g.purge_after);
    group.hasServer = true;
    group.items.push(...serverItems[i]);
  });
  local.forEach((entry, i) => {
    const group = groupOf(entry.groupId, entry.deletedAt, entry.purgeAfter);
    group.hasLocal = true;
    group.items.push(localItems[i]);
  });
  return {
    graceDays: server.grace_days ?? LOCAL_TRASH_DAYS,
    groups: [...groups.values()].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)),
  };
}

/** Browser entries can only come back while results live in this browser. */
export function canRestore(group: TrashGroupView): boolean {
  return !group.hasLocal || resultsAreLocal();
}

/** Restores the server part first (it may bring back the exam the browser rows belong to), then the browser part. */
export async function restoreGroup(group: TrashGroupView): Promise<RestoreResult> {
  const result: RestoreResult = { restored: {}, skipped: [] };
  const add = (part: RestoreResult) => {
    for (const [table, n] of Object.entries(part.restored)) result.restored[table] = (result.restored[table] ?? 0) + n;
    result.skipped.push(...part.skipped);
  };
  if (group.hasServer) add(await restoreServerGroup(group.groupId));
  if (group.hasLocal && resultsAreLocal()) {
    const key = get(sessionStore).sessionKey;
    add(await restoreLocalGroup(group.groupId, key, async (examId) => (await examRepository.getById(examId, key)) !== undefined));
  }
  // Restored results count again (issue #238).
  for (const examId of new Set(group.items.map((item) => item.examId))) markStatisticsDirty(examId);
  return result;
}

/** Erases the group at once, on the server and in this browser. */
export async function purgeGroup(group: TrashGroupView): Promise<void> {
  if (group.hasServer) await purgeServerGroup(group.groupId);
  if (group.hasLocal) await purgeLocalGroup(group.groupId);
}
