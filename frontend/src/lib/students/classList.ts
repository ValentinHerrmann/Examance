/** The exam's class list (issue #209, docs/dev/result_sharing.md): students entered on the Students page before any scan, as ordinary student records keyed by their sticker payload, so a scan of the sticker lands on the same row. Stickers, sharing and Mebis/Artemis read only these records; a later cross-exam student management feeds the same import. */

import { stickerId } from '#lib/crypto/stickerKey';
import type { StudentRecord } from '#lib/db/schema';
import { matchContacts, type Contact } from '#lib/lms/contacts';
import { studentRepository } from '#lib/repositories/studentRepository';
import { pseudonymFor } from '#lib/services/pseudonymRekey';
import { formatStudentName, formatStudentQr } from '#lib/utils/studentQr';

export interface ImportPlan {
  /** Contacts that become new students. */
  add: Contact[];
  /** Existing students that get the contact's e-mail address (and are marked as listed). */
  update: { student: StudentRecord; email: string | undefined }[];
  /** Existing students the list confirms without a change. */
  unchanged: number;
}

/** What importing *contacts* would change: matched students get a new address, the rest of the list becomes new students. */
export function planImport(students: readonly StudentRecord[], contacts: readonly Contact[]): ImportPlan {
  const { matches, unmatchedContacts } = matchContacts(students, contacts);
  const update: ImportPlan['update'] = [];
  let unchanged = 0;
  for (const { student, contact } of matches) {
    const email = contact.email ?? student.email;
    if (email !== student.email || !student.fromList) update.push({ student, email });
    else unchanged++;
  }
  return { add: unmatchedContacts.filter((c) => formatStudentName(c.name)), update, unchanged };
}

/** A new listed student: the sticker payload is the pseudonym's raw value, the id the LMS id or a stable one from the name. */
export async function listedStudent(examId: string, contact: Contact): Promise<StudentRecord> {
  const name = formatStudentName(contact.name);
  const raw = formatStudentQr(name, contact.id || (await stickerId(name)));
  return {
    ...(await pseudonymFor(examId, raw)),
    examId,
    studentName: name,
    email: contact.email ?? undefined,
    fromList: true,
    piiCt: new Uint8Array(0),
    piiIv: new Uint8Array(12),
  };
}

/** Writes *plan* through the student repository (sealed, following the storage mode). */
export async function applyImport(examId: string, plan: ImportPlan, key: CryptoKey | null): Promise<void> {
  for (const { student, email } of plan.update) await studentRepository.save({ ...student, email, fromList: true }, key); // NOSONAR: one row at a time keeps the order and the error report simple
  for (const contact of plan.add) await studentRepository.save(await listedStudent(examId, contact), key); // NOSONAR: as above
}
