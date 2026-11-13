/** The exam's class list (issue #209, docs/dev/result_sharing.md): students entered on the Students page before any scan, as ordinary student records keyed by their sticker payload, so a scan of the sticker lands on the same row. Stickers, sharing and Mebis/Artemis read only these records; a later cross-exam student management feeds the same import. Merging and bulk edits go only through this module. */

import { stickerId } from '#lib/crypto/stickerKey';
import type { StudentRecord } from '#lib/db/schema';
import type { TranslationKey } from '#lib/i18n/types';
import { matchContacts, nameKey, type Contact, type ContactSource } from '#lib/lms/contacts';
import { studentRepository } from '#lib/repositories/studentRepository';
import { pseudonymFor } from '#lib/services/pseudonymRekey';
import { newTrashGroup } from '#lib/trash/group';
import { compareText } from '#lib/utils/listSort';
import { formatStudentName, formatStudentQr, normalizeLmsId } from '#lib/utils/studentQr';

/** The fields a teacher edits; everything else (pseudonym, raw sticker value) is never touched here. */
export type EditableField = 'studentName' | 'studentNumber' | 'mebisId' | 'artemisId' | 'email';
export const EDITABLE_FIELDS: readonly EditableField[] = ['studentName', 'studentNumber', 'mebisId', 'artemisId', 'email'];

export interface ImportPlan {
  /** Contacts that become new students. */
  add: Contact[];
  /** Existing students and what the list changes on them (marked as listed too). */
  update: { student: StudentRecord; changes: Partial<StudentRecord> }[];
  /** Existing students the list confirms without a change. */
  unchanged: number;
}

const ID_FIELD: Partial<Record<ContactSource, 'mebisId' | 'artemisId'>> = { mebis: 'mebisId', artemis: 'artemisId' };
const idField = (contact: Contact): 'mebisId' | 'artemisId' | null => ID_FIELD[contact.source] ?? null;

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

/** A student added by hand on the Students page (issue #212): a listed student like an imported one, so it gets a sticker payload and personal key; the sticker id is the Mebis id, else the Artemis id, else a stable one from the name. */
export async function newListedStudent(examId: string, fields: Partial<Record<EditableField, string>>): Promise<StudentRecord> {
  const mebisId = normalizeLmsId(fields.mebisId);
  const artemisId = normalizeLmsId(fields.artemisId);
  let source: ContactSource = 'list';
  if (mebisId) source = 'mebis';
  else if (artemisId) source = 'artemis';
  const student = await listedStudent(examId, { name: fields.studentName ?? '', id: mebisId ?? artemisId ?? null, email: fields.email?.trim() || null, source });
  return {
    ...student,
    ...(fields.studentNumber?.trim() ? { studentNumber: fields.studentNumber.trim() } : {}),
    ...(mebisId ? { mebisId } : {}),
    ...(artemisId ? { artemisId } : {}),
  };
}

/** Writes *plan* through the student repository (sealed, following the storage mode); new students are numbered after *students* in the list's order, so the class keeps the order of the imported file. */
export async function applyImport(examId: string, plan: ImportPlan, key: CryptoKey | null, students: readonly StudentRecord[]): Promise<void> {
  for (const { student, changes } of plan.update) await studentRepository.save({ ...student, ...changes }, key); // NOSONAR: one row at a time keeps the order and the error report simple
  const next = nextClassPosition(students);
  for (const [i, contact] of plan.add.entries()) {
    const student = await listedStudent(examId, contact);
    await studentRepository.save(next === undefined ? student : { ...student, classPosition: next + i }, key); // NOSONAR: as above
  }
}

/** A student with its number in the class list (issue #266). */
export interface NumberedStudent {
  student: StudentRecord;
  position: number;
}

export type NameOrder = 'lastName' | 'firstName';

/** Last and first name: "Last, First" by the comma convention, else the last word is the surname. */
function nameParts(name: string | undefined): { last: string; first: string } {
  const text = (name ?? '').trim();
  const comma = text.indexOf(',');
  if (comma >= 0) return { last: text.slice(0, comma).trim(), first: text.slice(comma + 1).trim() };
  const words = text.split(/\s+/);
  return { last: words.at(-1) ?? '', first: words.slice(0, -1).join(' ') };
}

/** Alphabetical order of two students by surname (*order* `lastName`) or given name first. */
export function compareByName(order: NameOrder): (a: StudentRecord, b: StudentRecord) => number {
  return (a, b) => {
    const x = nameParts(a.studentName);
    const y = nameParts(b.studentName);
    return order === 'lastName'
      ? compareText(x.last, y.last) || compareText(x.first, y.first)
      : compareText(x.first, y.first) || compareText(x.last, y.last);
  };
}

/** The class list in its order with each student's number: numbered students by their number, then the rest by surname with the next free numbers (a list never ordered is numbered by surname, without writing anything). */
export function numberStudents(students: readonly StudentRecord[]): NumberedStudent[] {
  const byLast = compareByName('lastName');
  const positioned = students.filter((st) => st.classPosition !== undefined).sort((a, b) => a.classPosition! - b.classPosition! || byLast(a, b));
  const rest = students.filter((st) => st.classPosition === undefined).sort(byLast);
  let next = positioned.at(-1)?.classPosition ?? 0;
  return [...positioned.map((student) => ({ student, position: student.classPosition! })), ...rest.map((student) => ({ student, position: ++next }))];
}

/** The number a new student gets: after the last one, 1 for an empty list, none while the list was never ordered (it then stays in name order). */
export function nextClassPosition(students: readonly StudentRecord[]): number | undefined {
  if (!students.length) return 1;
  const positions = students.flatMap((st) => (st.classPosition === undefined ? [] : [st.classPosition]));
  return positions.length ? Math.max(...positions) + 1 : undefined;
}

/** A number padded to the width of the list's highest one ("07" in a class of 25), so printed stickers line up and sort by eye. */
export function positionLabel(position: number, highest: number): string {
  return String(position).padStart(String(highest).length, '0');
}

/** The rows whose stored number differs from *numbered*'s, carrying their new number. */
function changedPositions(numbered: readonly NumberedStudent[]): StudentRecord[] {
  return numbered.flatMap(({ student, position }) => (student.classPosition === position ? [] : [{ ...student, classPosition: position }]));
}

/** Renumbers the whole class 1..n alphabetically by surname or given name; returns the rows to save. */
export function renumberStudents(students: readonly StudentRecord[], order: NameOrder): StudentRecord[] {
  return changedPositions([...students].sort(compareByName(order)).map((student, i) => ({ student, position: i + 1 })));
}

/** Swaps a student's number with its neighbour's; returns the rows to save (all of them when the list was never ordered, so its name order becomes stored numbers). */
export function moveStudent(students: readonly StudentRecord[], pseudonymHmac: string, direction: 'up' | 'down'): StudentRecord[] {
  const numbered = numberStudents(students);
  const from = numbered.findIndex((n) => n.student.pseudonymHmac === pseudonymHmac);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= numbered.length) return [];
  const moved = numbered.map((n) => ({ ...n }));
  [moved[from].position, moved[to].position] = [numbered[to].position, numbered[from].position];
  return changedPositions(moved);
}

/** Saves renumbered rows (from `renumberStudents`/`moveStudent`). */
export async function savePositions(rows: readonly StudentRecord[], key: CryptoKey | null): Promise<void> {
  for (const row of rows) await studentRepository.save(row, key); // NOSONAR: one row at a time keeps the error report simple
}

/** A field both rows fill with different text: the teacher picks the value (a merge only happens when something already went wrong, so nothing is decided silently). */
export interface MergeChoice {
  field: EditableField;
  keepValue: string;
  otherValue: string;
  /** Same value in another spelling ("Muster, Anna" / "Anna Muster", an id prefix, e-mail case). */
  equivalent: boolean;
}

export interface MergePlan {
  /** The row that stays: its pseudonym and sticker value are what the paper carries, so they never change. */
  keep: StudentRecord;
  /** The row that goes to the trash. */
  drop: StudentRecord;
  /** *keep* with the other row's data filled in; fields in *choices* keep *keep*'s value until the teacher picks. */
  merged: StudentRecord;
  choices: MergeChoice[];
  /** Fields only the dropped row had, taken over into *merged*. */
  filled: EditableField[];
}

/** Same value in another spelling: ids without prefix, names in any order, other text ignoring case. */
function same(field: EditableField, a: string, b: string): boolean {
  if (field === 'mebisId' || field === 'artemisId') return normalizeLmsId(a) === normalizeLmsId(b);
  if (field === 'studentName') return nameKey(a) === nameKey(b);
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

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
  const positions = [keep.classPosition, drop.classPosition].filter((p): p is number => p !== undefined);
  const merged: StudentRecord = { ...keep, fromList: !!(keep.fromList || drop.fromList), ...(positions.length ? { classPosition: Math.min(...positions) } : {}) };
  const choices: MergeChoice[] = [];
  const filled: EditableField[] = [];
  for (const field of EDITABLE_FIELDS) {
    const kept = keep[field]?.trim();
    const other = drop[field]?.trim();
    if (!other) continue;
    if (!kept) {
      merged[field] = other;
      filled.push(field);
    } else if (kept !== other) choices.push({ field, keepValue: kept, otherValue: other, equivalent: same(field, kept, other) });
  }
  return { keep, drop, merged, choices, filled };
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

/** Changed, removed and duplicate Mebis/Artemis ids of one edited row. */
function idNotices(prev: StudentRecord, next: StudentRecord, name: string, count: (field: EditableField, value: string) => number): EditNotice[] {
  const notices: EditNotice[] = [];
  for (const field of ['mebisId', 'artemisId'] as const) {
    const was = prev[field] ?? '';
    const now = next[field] ?? '';
    if (was && was !== now) notices.push({ key: now ? 'lms.students.edit.warn.idChanged' : 'lms.students.edit.warn.idRemoved', name });
    if (now && count(field, now) > 1) notices.push({ key: 'lms.students.edit.warn.duplicateId', name });
  }
  return notices;
}

export interface EditNotice {
  key: TranslationKey;
  name: string;
  /** Blocks saving; everything else is a warning the teacher may accept. */
  blocking?: boolean;
}

/** What an edit (one row or many) may cause beyond the edited cells, per edited row: *all* is the whole list after the edit, so duplicates across rows are found. */
export function editWarnings(
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
      notices.push({ key: 'lms.students.edit.warn.emptyName', name: formatStudentName(prev.studentName) || '?', blocking: true });
      return;
    }
    if (hasSubmission(prev) && !same('studentName', prev.studentName ?? '', next.studentName)) notices.push({ key: 'lms.students.edit.warn.renamedScanned', name });
    notices.push(...idNotices(prev, next, name, count));
    if (prev.email && !next.email) notices.push({ key: 'lms.students.edit.warn.emailRemoved', name });
    if (count('studentName', next.studentName) > 1) notices.push({ key: 'lms.students.edit.warn.duplicateName', name });
  });
  return notices;
}
