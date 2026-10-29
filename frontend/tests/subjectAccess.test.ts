import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../src/lib/db/db';
import { exportStudentData } from '../src/lib/gdpr/subjectAccess';
import { ensure64CharHex } from '../src/lib/crypto/hmac';
import { examRepository } from '../src/lib/repositories/examRepository';
import { scoreRepository } from '../src/lib/repositories/scoreRepository';
import { studentRepository } from '../src/lib/repositories/studentRepository';
import { submissionRepository } from '../src/lib/repositories/submissionRepository';
import { sessionStore } from '../src/lib/stores/session';

const EXAM = 'exam-1';
const RAW = 'pseudonym-of-anna';

describe('exportStudentData (Art. 15)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.auditLog.clear();
    const key = await crypto.subtle.importKey('raw', new Uint8Array(32).fill(7), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    await sessionStore.unlock({ masterKey: key, sessionKey: key, sessionNonce: new Uint8Array(12) });
  });

  it('collects the student and only their submissions, matched by raw id or HMAC, in order', async () => {
    const hmac = await ensure64CharHex(RAW);
    vi.spyOn(studentRepository, 'getByExamId').mockResolvedValue([
      { pseudonymId: 'someone-else', examId: EXAM, studentName: 'Ben' },
      { pseudonymId: hmac, examId: EXAM, studentName: 'Anna' },
    ] as never);
    vi.spyOn(examRepository, 'getById').mockResolvedValue({ id: EXAM, title: 'Test' } as never);
    vi.spyOn(submissionRepository, 'getByExamId').mockResolvedValue([
      { id: 's1', examId: EXAM, pseudonymHash: RAW, totalScore: 7 },
      { id: 's2', examId: EXAM, pseudonymHash: 'someone-else' },
      { id: 's3', examId: EXAM, pseudonymHash: hmac },
    ] as never);
    vi.spyOn(scoreRepository, 'getBySubmissionId').mockImplementation(async (_exam, subId) =>
      subId === 's1' ? ([{ exerciseId: 'e1', score: 7 }] as never) : ([] as never),
    );

    const out = await exportStudentData(RAW, EXAM);

    expect(out.identity.studentName).toBe('Anna');
    expect(out.submissions.map((s) => s.submissionId)).toEqual(['s1', 's3']);
    expect(out.submissions[0]).toMatchObject({ examTitle: 'Test', totalScore: 7, exerciseScores: [{ exerciseId: 'e1', score: 7 }] });
    // The disclosure itself is audited.
    expect(await db.auditLog.count()).toBe(1);
  });

  it('refuses a pseudonym without a student', async () => {
    vi.spyOn(studentRepository, 'getByExamId').mockResolvedValue([] as never);
    await expect(exportStudentData(RAW, EXAM)).rejects.toThrow('No student found');
  });
});
