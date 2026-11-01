import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../src/lib/db/db';
import { exportStudentData } from '../src/lib/gdpr/subjectAccess';
import { keyFromRaw, pseudonymBase } from '../src/lib/crypto/pseudonymKey';
import { examRepository } from '../src/lib/repositories/examRepository';
import { scoreRepository } from '../src/lib/repositories/scoreRepository';
import { studentRepository } from '../src/lib/repositories/studentRepository';
import { submissionRepository } from '../src/lib/repositories/submissionRepository';
import { sessionStore } from '../src/lib/stores/session';
import { hkdfMasterKey } from './helpers/keys';

const EXAM = 'exam-1';
const RAW = 'pseudonym-of-anna';

describe('exportStudentData (Art. 15)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.auditLog.clear();
    const key = await crypto.subtle.importKey('raw', new Uint8Array(32).fill(7), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    await sessionStore.unlock({ masterKey: await hkdfMasterKey(), sessionKey: key, sessionNonce: new Uint8Array(12) });
  });

  it('collects the student and only their submissions, whatever pseudonym version each row is stored at, in order', async () => {
    const hash = await pseudonymBase(RAW);
    const keyed = await keyFromRaw(EXAM, RAW);
    vi.spyOn(studentRepository, 'getByExamId').mockResolvedValue([
      { pseudonymHmac: 'someone-else', examId: EXAM, studentName: 'Ben' },
      { pseudonymHmac: hash, examId: EXAM, studentName: 'Anna' },
    ] as never);
    vi.spyOn(examRepository, 'getById').mockResolvedValue({ id: EXAM, title: 'Test' } as never);
    vi.spyOn(submissionRepository, 'getByExamId').mockResolvedValue([
      { id: 's1', examId: EXAM, pseudonymHmac: RAW, totalScore: 7 },
      { id: 's2', examId: EXAM, pseudonymHmac: 'someone-else' },
      { id: 's3', examId: EXAM, pseudonymHmac: keyed, pseudonymVersion: 2 },
    ] as never);
    vi.spyOn(scoreRepository, 'getBySubmissionId').mockImplementation(async (_exam, subId) =>
      subId === 's1' ? ([{ exerciseId: 'e1', score: 7 }] as never) : ([] as never),
    );

    const out = await exportStudentData({ examId: EXAM, pseudonymHmac: RAW });

    expect(out.identity.studentName).toBe('Anna');
    expect(out.pseudonymHmac).toBe(keyed);
    expect(out.submissions.map((s) => s.submissionId)).toEqual(['s1', 's3']);
    expect(out.submissions[0]).toMatchObject({ examTitle: 'Test', totalScore: 7, exerciseScores: [{ exerciseId: 'e1', score: 7 }] });
    // The disclosure itself is audited.
    expect(await db.auditLog.count()).toBe(1);
  });

  it('refuses a pseudonym without a student', async () => {
    vi.spyOn(studentRepository, 'getByExamId').mockResolvedValue([] as never);
    await expect(exportStudentData({ examId: EXAM, pseudonymHmac: RAW })).rejects.toThrow('No student found');
  });
});
