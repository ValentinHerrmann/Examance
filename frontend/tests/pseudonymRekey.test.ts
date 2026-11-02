import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/api/client', async () => (await import('./helpers/fakeServer')).clientModule);

import { fakeServer } from './helpers/fakeServer';
import { db } from '../src/lib/db/db';
import { decryptStudent, encryptStudent } from '../src/lib/db/dbEncryption';
import { keyFromRaw, pseudonymBase } from '../src/lib/crypto/pseudonymKey';
import { runPseudonymRekey } from '../src/lib/services/pseudonymRekey';
import { offlineQueue } from '../src/lib/services/offlineQueue';
import { sessionStore } from '../src/lib/stores/session';
import { storagePolicyStore } from '../src/lib/stores/storagePolicy';
import type { StudentRecord } from '../src/lib/db/schema';
import { get } from 'svelte/store';
import { hkdfMasterKey } from './helpers/keys';

// Issue #177: the post-unlock re-key moves version-1 rows to the keyed per-exam HMAC without losing or mislinking anything.
const EXAM = 'exam-rekey';
let key: CryptoKey;

const student = (pseudonymHmac: string, over: Partial<StudentRecord> = {}): StudentRecord => ({
  examId: EXAM,
  pseudonymHmac,
  piiCt: new Uint8Array(0),
  piiIv: new Uint8Array(12),
  ...over,
});

async function putLocalStudent(st: StudentRecord) {
  await db.examStudents.put(await encryptStudent(st, key));
}

describe('runPseudonymRekey', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await Promise.all([db.examStudents.clear(), db.submissions.clear(), db.offlineQueue.clear()]);
    offlineQueue.set([]);
    fakeServer.reset();
    key = await crypto.subtle.importKey('raw', new Uint8Array(32).fill(4), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    await sessionStore.unlock({ masterKey: await hkdfMasterKey(), sessionKey: key, sessionNonce: new Uint8Array(12) });
  });

  describe('hybrid (results in this browser)', () => {
    beforeEach(() => storagePolicyStore.setPolicy({ storageMode: 'hybrid', latexCompilation: 'local' }));

    it('keys students and submissions, seals the raw QR value and keeps the link', async () => {
      const raw = 'BG:v1:Anna_Muster';
      await putLocalStudent(student(raw, { studentName: 'Anna' }));
      // As the Dexie v12 upgrade stamps every older row.
      await db.submissions.put({ id: 'sub-1', examId: EXAM, pseudonymHmac: raw, pseudonymVersion: 1, createdAt: '' });

      expect(await runPseudonymRekey()).toBe(true);

      const keyed = await keyFromRaw(EXAM, raw);
      const rows = await db.examStudents.toArray();
      expect(rows.map((r) => [r.pseudonymHmac, r.pseudonymVersion])).toEqual([[keyed, 2]]);
      // The raw value is no plain column any more, only inside the sealed payload.
      expect(JSON.stringify(rows[0])).not.toContain('Anna_Muster');
      const opened = await decryptStudent(rows[0], key);
      expect(opened).toMatchObject({ studentName: 'Anna', pseudonymRaw: raw, pseudonymBase: await pseudonymBase(raw) });
      expect(await db.submissions.get('sub-1')).toMatchObject({ pseudonymHmac: keyed, pseudonymVersion: 2 });
      // Idempotent: nothing left to do.
      expect(await runPseudonymRekey()).toBe(false);
    });

    it('merges a raw row and a hash row of the same student, keeping the one with the identity', async () => {
      const raw = 'student-uuid-7';
      await putLocalStudent(student(raw));
      await putLocalStudent(student(await pseudonymBase(raw), { studentName: 'Carla', studentNumber: '42' }));

      await runPseudonymRekey();

      const rows = await db.examStudents.toArray();
      expect(rows).toHaveLength(1);
      expect((await decryptStudent(rows[0], key)).studentName).toBe('Carla');
    });

    it('leaves an exam whose rows do not open untouched (never re-seals blanks)', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await db.examStudents.put({ ...student('raw-x'), payloadCt: new Uint8Array(32).fill(9), payloadIv: new Uint8Array(12) });

      expect(await runPseudonymRekey()).toBe(false);
      expect((await db.examStudents.toArray()).map((r) => r.pseudonymHmac)).toEqual(['raw-x']);
    });
  });

  describe('all-server', () => {
    beforeEach(() => storagePolicyStore.setPolicy({ storageMode: 'all-server', latexCompilation: 'local' }));

    it('renames every server value of the exam and rewrites queued writes with it', async () => {
      const base = await pseudonymBase('server-student');
      fakeServer.state.exams.set(EXAM, { id: EXAM, title: 'Server', created_at: '' });
      fakeServer.state.students.set(EXAM, [{ pseudonym_hmac: base, exam_id: EXAM }]);
      fakeServer.state.submissions.set(EXAM, [{ id: 'sub-s', exam_id: EXAM, pseudonym_hmac: base }]);
      // An erasure queued offline before the re-key would replay as a 404 that counts as done.
      offlineQueue.set([{ id: 'q1', url: `/exams/${EXAM}/students/${base}`, method: 'DELETE', timestamp: 1 }]);

      expect(await runPseudonymRekey()).toBe(true);

      const keyed = await keyFromRaw(EXAM, base);
      expect(fakeServer.state.exams.get(EXAM).pseudonym_version).toBe(2);
      expect(fakeServer.state.students.get(EXAM)?.map((r: any) => r.pseudonym_hmac)).toEqual([keyed]);
      expect(fakeServer.state.submissions.get(EXAM)?.map((r: any) => r.pseudonym_hmac)).toEqual([keyed]);
      expect(get(offlineQueue).map((q) => q.url)).toEqual([`/exams/${EXAM}/students/${keyed}`]);
    });

    it('keeps the query of a queued permanent erasure when rewriting it', async () => {
      const base = await pseudonymBase('erased-student');
      fakeServer.state.exams.set(EXAM, { id: EXAM, title: 'Server', created_at: '' });
      fakeServer.state.students.set(EXAM, [{ pseudonym_hmac: base, exam_id: EXAM }]);
      // Issue #125: the GDPR erasure skips the trash with ?permanent=true; a rewrite that dropped it would trash the student instead.
      offlineQueue.set([{ id: 'q1', url: `/exams/${EXAM}/students/${base}?permanent=true`, method: 'DELETE', timestamp: 1 }]);

      expect(await runPseudonymRekey()).toBe(true);

      const keyed = await keyFromRaw(EXAM, base);
      expect(get(offlineQueue).map((q) => q.url)).toEqual([`/exams/${EXAM}/students/${keyed}?permanent=true`]);
    });
  });
});
