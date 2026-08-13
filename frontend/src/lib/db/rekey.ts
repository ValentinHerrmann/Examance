/**
 * Re-encrypt the whole local vault under a new key.
 *
 * Every encrypted payload is sealed with a session key derived from the user's
 * passphrase, so changing the passphrase changes the key and every record has
 * to be rewritten. Used by the migration away from the old design that kept a
 * generated password in localStorage.
 *
 * The walk runs inside a single Dexie transaction: a half-rekeyed vault would
 * be unreadable under either key.
 */

import { db } from './db';
import {
  decryptAuditEntry,
  decryptExam,
  decryptExercise,
  decryptOmrTemplate,
  decryptScore,
  decryptStudent,
  decryptSubmission,
  encryptAuditEntry,
  encryptExam,
  encryptExercise,
  encryptOmrTemplate,
  encryptScore,
  encryptStudent,
  encryptSubmission,
} from './dbEncryption';

export interface RekeyResult {
  exams: number;
  exercises: number;
  students: number;
  submissions: number;
  exerciseScores: number;
  auditLog: number;
  omrTemplates: number;
}

async function rekeyTable<T>(
  rows: T[],
  decryptRow: (row: T, key: CryptoKey | null) => Promise<T>,
  encryptRow: (row: T, key: CryptoKey | null) => Promise<T>,
  oldKey: CryptoKey,
  newKey: CryptoKey
): Promise<T[]> {
  const out: T[] = [];
  for (const row of rows) {
    const plain = await decryptRow(row, oldKey);
    out.push(await encryptRow(plain, newKey));
  }
  return out;
}

/**
 * Decrypt every record with *oldKey* and re-encrypt it with *newKey*.
 *
 * @throws if any record fails to decrypt — that means `oldKey` is wrong, and
 *         continuing would silently destroy data.
 */
export async function rekeyDatabase(
  oldKey: CryptoKey,
  newKey: CryptoKey
): Promise<RekeyResult> {
  const result: RekeyResult = {
    exams: 0,
    exercises: 0,
    students: 0,
    submissions: 0,
    exerciseScores: 0,
    auditLog: 0,
    omrTemplates: 0,
  };

  await db.transaction(
    'rw',
    [
      db.exams,
      db.exercises,
      db.students,
      db.submissions,
      db.exerciseScores,
      db.auditLog,
      db.omrTemplates,
    ],
    async () => {
      const exams = await rekeyTable(
        await db.exams.toArray(), decryptExam, encryptExam, oldKey, newKey
      );
      const exercises = await rekeyTable(
        await db.exercises.toArray(), decryptExercise, encryptExercise, oldKey, newKey
      );
      const students = await rekeyTable(
        await db.students.toArray(), decryptStudent, encryptStudent, oldKey, newKey
      );
      const submissions = await rekeyTable(
        await db.submissions.toArray(), decryptSubmission, encryptSubmission, oldKey, newKey
      );
      const scores = await rekeyTable(
        await db.exerciseScores.toArray(), decryptScore, encryptScore, oldKey, newKey
      );
      const audit = await rekeyTable(
        await db.auditLog.toArray(), decryptAuditEntry, encryptAuditEntry, oldKey, newKey
      );
      // OMR templates do not follow the encryptX(record, key) shape: the
      // encryptor takes the payload separately, and the decryptor returns null
      // instead of throwing. A null payload where ciphertext exists means the
      // old key was wrong — abort rather than overwrite it with an empty one.
      const rawTemplates = await db.omrTemplates.toArray();
      const templates = [];
      for (const tpl of rawTemplates) {
        const payload = await decryptOmrTemplate(tpl, oldKey);
        if (payload === null) {
          if (tpl.payloadCt && tpl.payloadCt.byteLength >= 16) {
            throw new Error(
              `Could not decrypt OMR template ${tpl.id} with the existing key; aborting re-encryption.`
            );
          }
          templates.push(tpl); // Nothing captured yet — leave as-is.
          continue;
        }
        templates.push(await encryptOmrTemplate(tpl, newKey, payload));
      }

      // Write only after every record has been re-sealed, so a decryption
      // failure aborts before anything is overwritten.
      await db.exams.bulkPut(exams);
      await db.exercises.bulkPut(exercises);
      await db.students.bulkPut(students);
      await db.submissions.bulkPut(submissions);
      await db.exerciseScores.bulkPut(scores);
      await db.auditLog.bulkPut(audit);
      await db.omrTemplates.bulkPut(templates);

      result.exams = exams.length;
      result.exercises = exercises.length;
      result.students = students.length;
      result.submissions = submissions.length;
      result.exerciseScores = scores.length;
      result.auditLog = audit.length;
      result.omrTemplates = templates.length;
    }
  );

  return result;
}
