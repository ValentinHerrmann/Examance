import { get } from 'svelte/store';
import { api } from '#lib/api/client';
import { db } from '#lib/db/db';
import { resultsAreLocal, storagePolicyStore } from '#lib/stores/storagePolicy';
import { encryptStudent, decryptStudent } from '#lib/db/dbEncryption';
import { enqueueOrThrow } from '#lib/services/offlineQueue';
import { currentKeyId } from '#lib/services/keyEnvelopeService';
import { examRepository } from './examRepository';
import type { StudentRecord } from '#lib/db/schema';
import { uint8ArrayToBase64, base64ToUint8Array } from '#lib/crypto/aesGcm';
import { joinKey, joinKeys, pseudonymBase, serverVersion } from '#lib/crypto/pseudonymKey';

/** A student row as `GET /exams/{id}/students` returns it, still sealed. */
export function mapApiToStudentRecord(st: any, fallbackExamId: string): StudentRecord {
  const payloadCt = st.pii_ciphertext_b64 ? base64ToUint8Array(st.pii_ciphertext_b64) : undefined;
  const payloadIv = st.iv_b64 ? base64ToUint8Array(st.iv_b64) : undefined;
  return {
    pseudonymHmac: st.pseudonym_hmac,
    pseudonymVersion: serverVersion(st),
    examId: st.exam_id || fallbackExamId,
    piiCt: payloadCt || new Uint8Array(0),
    piiIv: payloadIv || new Uint8Array(12),
    payloadCt,
    payloadIv,
  };
}

/** The `POST /exams/{id}/students` body for a decrypted student; seals the identity under `key`. */
export async function studentServerPayload(student: StudentRecord, key: CryptoKey | null) {
  const encrypted = await encryptStudent(student, key);
  const version = student.pseudonymVersion ?? 1;
  return {
    // A version-1 value is sent as older builds did: its SHA-256 form.
    pseudonym_hmac: version === 2 ? student.pseudonymHmac : await pseudonymBase(student.pseudonymHmac),
    pseudonym_version: version,
    pii_ciphertext_b64: encrypted.payloadCt ? uint8ArrayToBase64(encrypted.payloadCt) : uint8ArrayToBase64(student.piiCt),
    iv_b64: encrypted.payloadIv ? uint8ArrayToBase64(encrypted.payloadIv) : uint8ArrayToBase64(student.piiIv),
    // Not an Argon2id salt: ciphertext is sealed under HKDF(dataKey, sessionNonce). These 16 bytes record *which data-key generation* sealed it, so a later key rotation is diagnosable rather than silently unreadable (formerly 16 hardcoded zero bytes).
    encryption_salt_b64: uint8ArrayToBase64(currentKeyId()),
  };
}

/** A version-1 record as its version-2 form, for this browser's store; the raw value moves into the sealed payload. */
async function asKeyed(student: StudentRecord): Promise<StudentRecord> {
  if (student.pseudonymVersion === 2) return student;
  const stored = student.pseudonymHmac;
  return {
    ...student,
    pseudonymHmac: await joinKey(student),
    pseudonymVersion: 2,
    // A 64-character value may be a hash already; only a shorter one is certainly the raw id.
    pseudonymRaw: student.pseudonymRaw ?? (stored.length === 64 ? undefined : stored),
    pseudonymBase: student.pseudonymBase ?? (await pseudonymBase(stored)),
  };
}

export const studentRepository = {
  async getAll(key: CryptoKey | null): Promise<StudentRecord[]> {
    if (resultsAreLocal()) {
      const raw = await db.examStudents.toArray();
      return Promise.all(raw.map((st) => decryptStudent(st, key)));
    } else {
      // Per exam: no endpoint lists "every student" (the router is at /exams/{id}/students). A failed read throws; an empty list would let erasure and .bgproj exports run on partial data.
      const exams = await examRepository.getAll(key);
      const all: StudentRecord[] = [];
      for (const exam of exams) {
        all.push(...(await this.getByExamId(exam.id, key)));
      }
      return all;
    }
  },

  async getByExamId(examId: string, key: CryptoKey | null): Promise<StudentRecord[]> {
    if (resultsAreLocal()) {
      const raw = await db.examStudents.where('examId').equals(examId).toArray();
      return Promise.all(raw.map((st) => decryptStudent(st, key)));
    } else {
      // all-server holds nothing locally, so a local fallback would be a silent empty list: a failed read throws and the caller reports it. silentError because callers show their own error.
      const rawList = await api.get<any[]>(`/exams/${examId}/students`, { silentError: true });
      const serverStudents = await Promise.all(
        rawList.map((st: any) => decryptStudent(mapApiToStudentRecord(st, examId), key))
      );
      // Leftovers of a former hybrid browser fill in names the server copy lacks; rows meet on their join key, whatever version each was stored at.
      const localRaw = await db.examStudents.where('examId').equals(examId).toArray();
      const localStudents = await Promise.all(localRaw.map((st) => decryptStudent(st, key)));
      const [serverKeys, localKeys] = await Promise.all([joinKeys(serverStudents), joinKeys(localStudents)]);
      const byKey = new Map<string, StudentRecord>(serverStudents.map((st, i) => [serverKeys[i], st]));
      localStudents.forEach((st, i) => {
        const k = localKeys[i];
        const existing = byKey.get(k);
        byKey.set(
          k,
          existing
            ? {
                ...existing,
                studentName: st.studentName || existing.studentName,
                studentNumber: st.studentNumber || existing.studentNumber,
                fallbackCode: st.fallbackCode || existing.fallbackCode,
                pseudonymRaw: st.pseudonymRaw || existing.pseudonymRaw,
              }
            : st
        );
      });
      return Array.from(byKey.values());
    }
  },

  async save(student: StudentRecord, key: CryptoKey | null): Promise<void> {
    const policy = get(storagePolicyStore);

    // In all-server mode nothing about a pupil is supposed to persist on this device. The local write used to happen before this check, so it did.
    if (policy.storageMode !== 'all-server') {
      // This browser stores keyed rows only; a record read before the re-key replaces its old row instead of duplicating it.
      const keyed = await asKeyed(student);
      // `encrypted` deliberately carries no plaintext identity fields — see encryptStudent(). Anything that needs the name reads it back through decryptStudent().
      const encrypted = await encryptStudent(keyed, key);
      await db.transaction('rw', db.examStudents, async () => {
        if (keyed.pseudonymHmac !== student.pseudonymHmac) {
          await db.examStudents.delete([student.examId, student.pseudonymHmac]);
        }
        await db.examStudents.put(encrypted);
      });
      return;
    }

    const payload = await studentServerPayload(student, key);
    try {
      await api.post(`/exams/${student.examId}/students`, payload, { silentError: true });
    } catch (err) {
      enqueueOrThrow(err, `/exams/${student.examId}/students`, 'POST', payload);
    }
  },

  /** Deletes the student a stored record names (`pseudonymHmac` as stored, never re-keyed). Students live per exam on the server (`/exams/{id}/students/{hmac}`); there is no exam-less route (F12). */
  async delete(student: Pick<StudentRecord, 'examId' | 'pseudonymHmac' | 'pseudonymVersion'>): Promise<void> {
    const { examId } = student;
    const target = await joinKey(student);

    // Locally in all modes, every row of this exam that stands for the same student.
    try {
      const candidates = await db.examStudents.where('examId').equals(examId).toArray();
      const keys = await joinKeys(candidates);
      await db.examStudents.bulkDelete(
        candidates.filter((_, i) => keys[i] === target).map((st) => [st.examId, st.pseudonymHmac])
      );
    } catch (err) {
      console.warn('Failed to clean up matching student records from IndexedDB:', err);
    }

    const policy = get(storagePolicyStore);
    if (policy.storageMode === 'all-server') {
      const serverValue =
        (student.pseudonymVersion ?? 1) === 2 ? student.pseudonymHmac : await pseudonymBase(student.pseudonymHmac);
      const url = `/exams/${examId}/students/${serverValue}`;
      try {
        await api.delete(url, { silentError: true });
      } catch (err) {
        enqueueOrThrow(err, url, 'DELETE');
      }
    }
  },
};
