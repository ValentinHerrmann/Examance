import 'fake-indexeddb/auto'; // In-memory IndexedDB mock for Vitest — must be imported before Dexie db module
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

// Exams and exercises always live on the server (issue #47): the archive round-trips run against an
// in-memory fake of the API. Results stay in IndexedDB because the tests run in hybrid mode.
vi.mock('../src/lib/api/client', async () => (await import('./helpers/fakeServer')).clientModule);

import { fakeServer } from './helpers/fakeServer';
import { packProject } from '../src/lib/archive/packer';
import { applyArchive, decryptArchive, unpackProject } from '../src/lib/archive/unpacker';
import { applyResolutions, detectConflicts } from '../src/lib/archive/conflicts';
import { count, newReport } from '../src/lib/archive/report';
import { db } from '../src/lib/db/db';
import {
  saveExamEncrypted,
  saveStudentEncrypted,
  saveExerciseEncrypted,
  saveSubmissionEncrypted,
  loadExamsEncrypted,
  loadStudentsEncrypted,
  loadExamExercisesEncrypted,
} from '../src/lib/db/dbEncryption';
import { decrypt, encrypt } from '../src/lib/crypto/aesGcm';
import { sessionStore } from '../src/lib/stores/session';
import { storagePolicyStore } from '../src/lib/stores/storagePolicy';
import { eraseStudent } from '../src/lib/gdpr/erasure';
import { checkRetention } from '../src/lib/gdpr/retention';

const packBlob = async (...args: Parameters<typeof packProject>) => (await packProject(...args)).blob;

const exam = (id: string, title: string) => ({
  id,
  teacherId: 'teacher-1',
  title,
  retentionUntil: '2028-01-01',
  compilationStatus: 'compiled' as const,
  createdAt: new Date().toISOString(),
});

describe('.bgproj Archive Packer and Unpacker', () => {
  const testPassword = 'SuperSecretTeacherPassword123!';
  let testKey: CryptoKey;

  beforeEach(async () => {
    fakeServer.reset();
    await db.exams.clear();
    await db.exercises.clear();
    await db.examExercises.clear();
    await db.students.clear();
    await db.submissions.clear();
    await db.exerciseScores.clear();
    await db.auditLog.clear();
    storagePolicyStore.setPolicy({ storageMode: 'hybrid', latexCompilation: 'local' });

    const rawKey = new Uint8Array(32).fill(7);
    testKey = await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    sessionStore.unlock({
      masterKey: testKey,
      sessionKey: testKey,
      sessionNonce: new Uint8Array(12),
    });
  });

  it('performs full pack and unpack round-trip correctly', async () => {
    const examId = 'exam-uuid-1';
    await saveExamEncrypted(exam(examId, 'Mathematics Final Exam'), testKey);
    await saveStudentEncrypted({
      pseudonymId: 'student-uuid-99',
      examId,
      fallbackCode: 'A-X7K2M9',
      piiCt: new Uint8Array([1, 2, 3, 4]),
      piiIv: new Uint8Array(12).fill(1),
    }, testKey);

    const packedBytes = await packBlob(testPassword);
    expect(packedBytes.size).toBeGreaterThan(41); // Larger than header

    // A fresh account on an empty server, and a browser without results.
    fakeServer.reset();
    await db.exams.clear();
    await db.students.clear();

    const result = await unpackProject(packedBytes, testPassword);
    expect(result.errors).toEqual([]);
    expect(result.examCount).toBe(1);
    expect(result.studentCount).toBe(1);

    const currentKey = get(sessionStore).sessionKey!;
    const restoredExams = await loadExamsEncrypted(currentKey);
    expect(restoredExams).toHaveLength(1);
    expect(restoredExams[0].title).toBe('Mathematics Final Exam');

    const restoredStudents = await loadStudentsEncrypted(currentKey);
    expect(restoredStudents).toHaveLength(1);
    expect(restoredStudents[0].fallbackCode).toBe('A-X7K2M9');
  });

  it('preserves exercise-exam junction links on pack and unpack round-trip', async () => {
    const examId = 'exam-uuid-2';
    const exerciseId = 'exercise-uuid-1';
    await saveExamEncrypted(exam(examId, 'Physics Exam'), testKey);
    await saveExerciseEncrypted({
      id: exerciseId,
      name: 'Kinematics Problem',
      maxPoints: 10,
      questionType: 'free_text',
      penalty: 0,
    }, testKey);
    fakeServer.state.links.set(examId, [{ exercise_id: exerciseId, order_index: 1 }]);

    const packedBytes = await packBlob(testPassword);
    fakeServer.reset();

    const result = await unpackProject(packedBytes, testPassword);
    expect(result.examCount).toBe(1);

    const currentKey = get(sessionStore).sessionKey!;
    const restoredExercises = await loadExamExercisesEncrypted(examId, currentKey);
    expect(restoredExercises).toHaveLength(1);
    expect(restoredExercises[0].id).toBe(exerciseId);
    expect(restoredExercises[0].name).toBe('Kinematics Problem');
    expect(restoredExercises[0].orderIndex).toBe(1);
  });

  it('carries scans through the archive and re-seals them under the live key', async () => {
    // Archives used to turn every Uint8Array into a {"0":…} object: scans never survived.
    const examId = 'exam-scan';
    await saveExamEncrypted(exam(examId, 'Scanned Exam'), testKey);
    const scanBytes = new TextEncoder().encode('%PDF-1.7 fake scan');
    const sealed = await encrypt(testKey, scanBytes);
    await saveSubmissionEncrypted({
      id: 'sub-scan-1',
      examId,
      pseudonymHash: 'pseudo-1',
      totalScore: 12,
      createdAt: new Date().toISOString(),
      scanCt: sealed.ciphertext,
      scanIv: sealed.iv,
    }, testKey);

    const packed = await packBlob(testPassword);
    fakeServer.reset();
    await db.submissions.clear();

    const result = await unpackProject(packed, testPassword);
    expect(result.errors).toEqual([]);

    const restored = await db.submissions.get('sub-scan-1');
    expect(restored?.scanCt).toBeInstanceOf(Uint8Array);
    const opened = await decrypt(get(sessionStore).sessionKey!, restored!.scanCt!, restored!.scanIv!);
    expect(new TextDecoder().decode(opened)).toBe('%PDF-1.7 fake scan');
  });

  it('withholds exercise code from a results-only archive', async () => {
    const examId = 'exam-shared';
    const exerciseId = 'exercise-shared';
    await saveExamEncrypted(exam(examId, 'Shared Exam'), testKey);
    await saveExerciseEncrypted({
      id: exerciseId,
      name: 'Secret Exercise',
      latexBody: '\\begin{Aufgabe}[4] secret \\end{Aufgabe}',
      maxPoints: 4,
      questionType: 'free_text',
      penalty: 0,
    }, testKey);
    fakeServer.state.links.set(examId, [{ exercise_id: exerciseId, order_index: 1 }]);

    const packed = await packBlob(testPassword, undefined, { includeExerciseCode: false });
    fakeServer.reset();

    const result = await unpackProject(packed, testPassword);
    expect(result.errors).toEqual([]);

    const imported = [...fakeServer.state.exercises.values()];
    expect(imported).toHaveLength(1);
    expect(imported[0].name).toBe('Secret Exercise');
    expect(imported[0].code_withheld).toBe(true);
    expect(imported[0].latex_body).toBeNull();
    expect(imported[0].max_points).toBe(4);
  });

  it('guarantees nonce and salt freshness on every pack operation', async () => {
    await saveExamEncrypted(exam('exam-1', 'Physics Midterm'), testKey);

    // Export twice with identical data & password
    const pack1Blob = await packBlob(testPassword);
    const pack2Blob = await packBlob(testPassword);
    const pack1 = new Uint8Array(await pack1Blob.arrayBuffer());
    const pack2 = new Uint8Array(await pack2Blob.arrayBuffer());

    // Salt (bytes 7..22) must be different
    expect(pack1.subarray(7, 23)).not.toEqual(pack2.subarray(7, 23));
    // Nonce (bytes 23..34) must be different
    expect(pack1.subarray(23, 35)).not.toEqual(pack2.subarray(23, 35));
    // Ciphertext bytes must be completely different
    expect(pack1).not.toEqual(pack2);
  });

  it('rejects unpack if password is wrong or ciphertext is tampered', async () => {
    await saveExamEncrypted(exam('e1', 'Chemistry'), testKey);
    const packed = await packBlob(testPassword);

    // Wrong password
    await expect(unpackProject(packed, 'WrongPassword')).rejects.toThrow();

    // Tampered payload byte
    const packedBytes = new Uint8Array(await packed.arrayBuffer());
    packedBytes[packedBytes.length - 5] ^= 0xff;
    await expect(unpackProject(packedBytes, testPassword)).rejects.toThrow();
  });

  it('merges into the existing workspace instead of wiping it', async () => {
    // Importing used to clear every table first — and, in archiveService, to do
    // so *before* the password had even been checked. An import now adds to
    // what is there; replacing is opt-in and happens after decryption.
    await saveExamEncrypted(exam('new-exam-id', 'New Biology Exam'), testKey);
    const newProjectPacked = await packBlob(testPassword);

    fakeServer.reset();
    await saveExamEncrypted(exam('old-exam-id', 'Old History Exam'), testKey);

    const result = await unpackProject(newProjectPacked, testPassword);
    expect(result.examCount).toBe(1);

    const currentKey = get(sessionStore).sessionKey!;
    const currentExams = await loadExamsEncrypted(currentKey);
    expect(currentExams.map((e) => e.id).sort()).toEqual(['new-exam-id', 'old-exam-id']);
  });

  it('leaves the workspace untouched when the password is wrong', async () => {
    await saveExamEncrypted(exam('precious-exam', 'Do not lose me'), testKey);
    const packed = await packBlob(testPassword);

    await expect(decryptArchive(packed, 'the-wrong-password')).rejects.toThrow();

    // The decrypt step touches nothing, so a typo costs nothing.
    const currentKey = get(sessionStore).sessionKey!;
    expect(await loadExamsEncrypted(currentKey)).toHaveLength(1);
  });

  it('does not replace the live session key with the archive key', async () => {
    // The importer used to call sessionStore.unlock() with a key derived from
    // the archive's own random salt, which the vault cannot re-derive: every
    // record written afterwards was sealed under a key that died with the tab.
    await saveExamEncrypted(exam('keyed-exam', 'Key check'), testKey);
    const packed = await packBlob(testPassword);
    const keyBefore = get(sessionStore).sessionKey;

    await unpackProject(packed, testPassword);

    expect(get(sessionStore).sessionKey).toBe(keyBefore);
  });

  it('reports what a results-only export holds and withholds', async () => {
    const examId = 'exam-report';
    await saveExamEncrypted(exam(examId, 'Report Exam'), testKey);
    await saveExerciseEncrypted({ id: 'ex-linked', name: 'Linked', maxPoints: 3, questionType: 'free_text', penalty: 0 }, testKey);
    await saveExerciseEncrypted({ id: 'ex-unrelated', name: 'Unrelated', maxPoints: 1, questionType: 'free_text', penalty: 0 }, testKey);
    fakeServer.state.links.set(examId, [{ exercise_id: 'ex-linked', order_index: 1 }]);
    await saveStudentEncrypted({ pseudonymId: 'stu-r', examId, fallbackCode: 'A-1', piiCt: new Uint8Array([1]), piiIv: new Uint8Array(12) }, testKey);

    const { report } = await packProject(testPassword, undefined, { includeExerciseCode: false });

    expect(report.direction).toBe('export');
    expect(report.codeWithheld).toBe(true);
    expect(count(report, 'exams', 'included')).toBe(1);
    // Only the exercises the exams link, never the rest of the library.
    expect(count(report, 'exercises', 'included')).toBe(1);
    expect(count(report, 'students', 'included')).toBe(1);
    expect(report.withheld).toEqual(expect.arrayContaining(['exerciseCode', 'resourceFiles']));
    expect(report.missing).toEqual([]);
  });

  it('links an exercise already readable on the server instead of copying it', async () => {
    // Prepares for exercises shared between accounts: the importer reuses what it can read.
    const examId = 'exam-linking';
    await saveExamEncrypted(exam(examId, 'Linking Exam'), testKey);
    await saveExerciseEncrypted({ id: 'ex-shared', name: 'Shared', maxPoints: 2, questionType: 'free_text', penalty: 0 }, testKey);
    fakeServer.state.links.set(examId, [{ exercise_id: 'ex-shared', order_index: 1 }]);
    const packed = await packBlob(testPassword, undefined, { includeExerciseCode: false });

    // Another account: the exam is new, the exercise is readable (e.g. public).
    fakeServer.state.exams.clear();
    fakeServer.state.links.clear();
    const report = (await unpackProject(packed, testPassword)).report;

    expect(count(report, 'exercises', 'linked')).toBe(1);
    expect(count(report, 'exercises', 'created')).toBe(0);
    expect(fakeServer.state.exercises.size).toBe(1);
    expect(fakeServer.state.links.get(examId)?.map((l) => l.exercise_id)).toEqual(['ex-shared']);
  });

  it('reports a linked exercise that is neither in the archive nor available', async () => {
    const examId = 'exam-gap';
    const payload = {
      exams: [exam(examId, 'Gap Exam')],
      exercises: [],
      exerciseExams: [{ examId, exerciseId: 'ex-foreign', orderIndex: 1 }],
      students: [],
      submissions: [],
      exerciseScores: [],
    };
    fakeServer.state.exercises.set('ex-foreign', { id: 'ex-foreign', name: 'Foreign' });
    fakeServer.state.hiddenExerciseIds.add('ex-foreign');

    const { report } = await applyArchive(payload);

    expect(count(report, 'exams', 'created')).toBe(1);
    expect(report.missing).toEqual([
      expect.objectContaining({ reason: 'exerciseUnavailable', exam: 'Gap Exam', item: 'ex-foreign' }),
    ]);
    expect(fakeServer.state.links.get(examId)).toEqual([]);
  });

  it('does not probe the results of exams this account does not own', async () => {
    // Each probe used to answer 401 (an error pop-up and a token refresh) for a foreign exam.
    storagePolicyStore.setPolicy({ storageMode: 'all-server', latexCompilation: 'local' });
    const payload = {
      exams: [exam('foreign-exam', 'Foreign')],
      students: [{ pseudonymId: 'stu-f', examId: 'foreign-exam', fallbackCode: 'A-2' }],
      submissions: [{ id: 'sub-f', examId: 'foreign-exam', pseudonymHash: 'p', totalScore: 1, createdAt: '' }],
    };

    const scan = await detectConflicts(payload, testKey);

    expect(scan.ownExamIds.has('foreign-exam')).toBe(false);
    expect(fakeServer.state.requests.filter((r) => r.includes('/exams/foreign-exam/'))).toEqual([]);
  });

  it('skips identical records and reports them as already present', async () => {
    await saveExamEncrypted(exam('exam-same', 'Same Exam'), testKey);
    await saveExerciseEncrypted({ id: 'ex-same', name: 'Same', maxPoints: 2, questionType: 'free_text', penalty: 0 }, testKey);
    const payload = await decryptArchive(await packBlob(testPassword), testPassword);

    const scan = await detectConflicts(payload, testKey);
    expect(scan.conflicts).toEqual([]);
    expect(scan.identical.map((i) => i.id)).toEqual(expect.arrayContaining(['exam-same', 'ex-same']));

    const before = fakeServer.state.requests.length;
    const { payload: next } = applyResolutions(payload, new Map(), scan.identical);
    const { report } = await applyArchive(next, undefined, { report: newReport('import'), ownExamIds: scan.ownExamIds });

    expect(report.problems).toEqual([]);
    expect(fakeServer.state.requests.slice(before).filter((r) => r.startsWith('POST'))).toEqual([]);
    expect(fakeServer.state.exams.size).toBe(1);
    expect(fakeServer.state.exercises.size).toBe(1);
  });
});

describe('GDPR Erasure & Retention', () => {
  beforeEach(async () => {
    await db.students.clear();
    await db.submissions.clear();
    await db.auditLog.clear();
  });

  it('erases student record and associated submissions, writing an audit log', async () => {
    const studentId = 'student-to-erase';
    const examId = 'exam-gdpr-1';

    await db.students.add({
      pseudonymId: studentId,
      examId,
      fallbackCode: 'F-123456',
      piiCt: new Uint8Array([5, 5, 5]),
      piiIv: new Uint8Array(12),
    });

    await db.submissions.add({
      id: 'sub-1',
      examId,
      pseudonymHash: 'some-hash',
      createdAt: new Date().toISOString(),
    });

    const result = await eraseStudent(studentId, examId);
    expect(result.pseudonymId).toBe(studentId);

    // Verify student is absent from IDB
    const student = await db.students.get(studentId);
    expect(student).toBeUndefined();

    // Verify audit entry exists
    const logs = await db.auditLog.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('DELETE');
  });

  it('checks retention period correctly', () => {
    const futureDate = new Date(Date.now() + 864000000).toISOString();
    const pastDate = new Date(Date.now() - 864000000).toISOString();

    const futureCheck = checkRetention(futureDate);
    expect(futureCheck.isExpired).toBe(false);
    expect(futureCheck.daysRemaining).toBeGreaterThan(0);

    const pastCheck = checkRetention(pastDate);
    expect(pastCheck.isExpired).toBe(true);
    expect(pastCheck.daysRemaining).toBeLessThanOrEqual(0);
  });
});
