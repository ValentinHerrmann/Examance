/** The exam's class list (issue #209, docs/dev/result_sharing.md): students entered on the Students page before any scan, as ordinary student records keyed by their sticker payload, so a scan of the sticker lands on the same row. Stickers, sharing and Mebis/Artemis read only these records; a later cross-exam student management feeds the same import. Merging and bulk edits go only through this module. */

import { stickerId } from '#lib/crypto/stickerKey';
import type { StudentRecord } from '#lib/db/schema';
import type { TranslationKey } from '#lib/i18n/types';
import { matchContacts, nameKey, type Contact } from '#lib/lms/contacts';
import { studentRepository } from '#lib/repositories/studentRepository';
import { pseudonymFor } from '#lib/services/pseudonymRekey';
import { newTrashGroup } from '#lib/trash/group';
import { formatStudentName, formatStudentQr, normalizeLmsId } from '#lib/utils/studentQr';

/** The fields a teacher edits; everything else (pseudonym, raw sticker value) is never touched here. */
export type EditableField = 'studentName' | 'mebisId' | 'artemisId' | 'email';
export const EDITABLE_FIELDS: readonly EditableField[] = ['studentName', 'mebisId', 'artemisId', 'email'];

export interface ImportPlan {
  /** Contacts that become new students. */
  add: Contact[];
  /** Existing students and what the list changes on them (marked as listed too). */
  update: { student: StudentRecord; changes: Partial<StudentRecord> }[];
  /** Existing students the list confirms without a change. */
  unchanged: number;
}

const idField = (contact: Contact): 'mebisId' | 'artemisId' | null =>
  contact.source === 'mebis' ? 'mebisId' : contact.source === 'artemis' ? 'artemisId' : null;

/** What importing *contacts* would change: matched students (by id of the same source, else by name) get the list's address and id, the rest becomes new students. A Mebis list and an Artemis course for the same class therefore meet on one row each. */
export function planImport(students: readonly StudentRecord[], contacts: readonly Contact[]): ImportPlan {
  const { matches, unmatchedContacts } = matchContacts(students, contacts);
  const update: ImportPlan['update'] = [];
  let unchanged = 0;
  for (const { student, contact } of matches) {
    const changes: Partial<StudentRecord> = {};
    if (contact.email && contact.email !== student.email) changes.email = contact.email;
    const field = idField(contact);
    const id = normalizeLmsId(contact.id);
    if (field && id && normalizeLmsId(student[field]) !== id) changes[field] = id;
    if (!student.fromList) changes.fromList = true;
    if (Object.keys(changes).length) update.push({ student, changes });
    else unchanged++;
  }
  return { add: unmatchedContacts.filter((c) => formatStudentName(c.name)), update, unchanged };
}

/** A new listed student: the sticker payload is the pseudonym's raw value, the id the LMS id or a stable one from the name; the id is also stored as the Mebis or Artemis id of its source. */
export async function listedStudent(examId: string, contact: Contact): Promise<StudentRecord> {
  const name = formatStudentName(contact.name);
  const raw = formatStudentQr(name, contact.id || (await stickerId(name)));
  const field = idField(contact);
  const id = normalizeLmsId(contact.id);
  return {
    ...(await pseudonymFor(examId, raw)),
    examId,
    studentName: name,
    email: contact.email ?? undefined,
    ...(field && id ? { [field]: id } : {}),
    fromList: true,
    piiCt: new Uint8Array(0),
    piiIv: new Uint8Array(12),
  };
}

/** Writes *plan* through the student repository (sealed, following the storage mode). */
export async function applyImport(examId: string, plan: ImportPlan, key: CryptoKey | null): Promise<void> {
  for (const { student, changes } of plan.update) await studentRepository.save({ ...student, ...changes }, key); // NOSONAR: one row at a time keeps the order and the error report simple
  for (const contact of plan.add) await studentRepository.save(await listedStudent(examId, contact), key); // NOSONAR: as above
}

export interface MergeConflict {
  field: EditableField;
  keepValue: string;
  otherValue: string;
}

export interface MergePlan {
  /** The row that stays: its pseudonym and sticker value are what the paper carries, so they never change. */
  keep: StudentRecord;
  /** The row that goes to the trash. */
  drop: StudentRecord;
  /** *keep* with the other row's data filled in; conflicting fields keep *keep*'s value until the teacher picks. */
  merged: StudentRecord;
  conflicts: MergeConflict[];
}

const same = (field: EditableField, a: string, b: string) =>
  field === 'mebisId' || field === 'artemisId' ? normalizeLmsId(a) === normalizeLmsId(b) : field === 'studentName' ? nameKey(a) === nameKey(b) : a.trim().toLowerCase() === b.trim().toLowerCase();

/** Merges two rows of one student (issue #209): e.g. a sticker printed without LMS id and the imported list row, or a Mebis and an Artemis row. The row with a scanned exam stays; two scanned rows are refused. */
export function mergeStudents(
  a: StudentRecord,
  b: StudentRecord,
  hasSubmission: (student: StudentRecord) => boolean
): MergePlan | { refused: TranslationKey } {
  if (hasSubmission(a) && hasSubmission(b)) return { refused: 'lms.students.merge.bothScanned' };
  // The scanned row, else the one that is not a list row (a sticker printed elsewhere), else the first.
  const keepA = hasSubmission(a) || (!hasSubmission(b) && (!a.fromList || !!b.fromList));
  const [keep, drop] = keepA ? [a, b] : [b, a];
  const merged: StudentRecord = { ...keep, fromList: !!(keep.fromList || drop.fromList) };
  const conflicts: MergeConflict[] = [];
  for (const field of EDITABLE_FIELDS) {
    const kept = keep[field]?.trim();
    const other = drop[field]?.trim();
    if (!other) continue;
    if (!kept) merged[field] = other;
    else if (!same(field, kept, other)) conflicts.push({ field, keepValue: kept, otherValue: other });
  }
  return { keep, drop, merged, conflicts };
}

/** Saves the merged row, then moves the other one to the trash (restorable). */
export async function applyMerge(examId: string, plan: Pick<MergePlan, 'merged' | 'drop'>, key: CryptoKey | null): Promise<void> {
  await studentRepository.save(plan.merged, key);
  await studentRepository.delete({ examId, pseudonymHmac: plan.drop.pseudonymHmac, pseudonymVersion: plan.drop.pseudonymVersion }, { group: newTrashGroup() });
}

/** Pairs of rows that look like one student (same name in any order) and can be merged: exactly two rows per name, not both scanned. */
export function duplicateCandidates(
  students: readonly StudentRecord[],
  hasSubmission: (student: StudentRecord) => boolean
): [StudentRecord, StudentRecord][] {
  const byName = new Map<string, StudentRecord[]>();
  for (const st of students) {
    const key = nameKey(st.studentName);
    if (key) byName.set(key, [...(byName.get(key) ?? []), st]);
  }
  return [...byName.values()].flatMap((rows) => (rows.length === 2 && !(hasSubmission(rows[0]) && hasSubmission(rows[1])) ? [[rows[0], rows[1]] as [StudentRecord, StudentRecord]] : []));
}

export interface EditNotice {
  key: TranslationKey;
  name: string;
  /** Blocks saving; everything else is a warning the teacher may accept. */
  blocking?: boolean;
}

/** What a bulk edit may cause beyond the edited cells, per edited row: *all* is the whole list after the edit, so duplicates across rows are found. */
export function bulkEditWarnings(
  before: readonly StudentRecord[],
  after: readonly StudentRecord[],
  all: readonly StudentRecord[],
  hasSubmission: (student: StudentRecord) => boolean
): EditNotice[] {
  const notices: EditNotice[] = [];
  const count = (field: EditableField, value: string) => all.filter((st) => st[field] && same(field, st[field]!, value)).length;
  after.forEach((next, i) => {
    const prev = before[i];
    const name = formatStudentName(next.studentName) || formatStudentName(prev.studentName) || '?';
    if (!next.studentName?.trim()) {
      notices.push({ key: 'lms.students.bulk.warn.emptyName', name: formatStudentName(prev.studentName) || '?', blocking: true });
      return;
    }
    if (hasSubmission(prev) && !same('studentName', prev.studentName ?? '', next.studentName)) notices.push({ key: 'lms.students.bulk.warn.renamedScanned', name });
    for (const field of ['mebisId', 'artemisId'] as const) {
      const was = prev[field] ?? '';
      const now = next[field] ?? '';
      if (was && was !== now) notices.push({ key: now ? 'lms.students.bulk.warn.idChanged' : 'lms.students.bulk.warn.idRemoved', name });
      if (now && count(field, now) > 1) notices.push({ key: 'lms.students.bulk.warn.duplicateId', name });
    }
    if (prev.email && !next.email) notices.push({ key: 'lms.students.bulk.warn.emailRemoved', name });
    if (count('studentName', next.studentName) > 1) notices.push({ key: 'lms.students.bulk.warn.duplicateName', name });
  });
  return notices;
}
