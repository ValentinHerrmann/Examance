import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../src/lib/api/client';
import { db } from '../src/lib/db/db';
import { encryptExam, encryptExercise } from '../src/lib/db/dbEncryption';
import type { ExamRecord, ExerciseRecord, StudentRecord } from '../src/lib/db/schema';
import { examRepository } from '../src/lib/repositories/examRepository';
import { exerciseRepository } from '../src/lib/repositories/exerciseRepository';
import { studentRepository } from '../src/lib/repositories/studentRepository';
import { storagePolicyStore } from '../src/lib/stores/storagePolicy';

vi.mock('../src/lib/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const failWith = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

describe('failed reads are never "nothing there" (issue #289)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await Promise.all([db.exams.clear(), db.examExercises.clear(), db.exercises.clear(), db.examStudents.clear()]);
    storagePolicyStore.setPolicy({ storageMode: 'all-server', latexCompilation: 'server' });
  });

  it('answers a missing exam only for a 404', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(failWith(404));
    await expect(examRepository.getById('exam-1', null)).resolves.toBeUndefined();
  });

  it('throws a failed exam read without a local copy', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(failWith(500));
    await expect(examRepository.getById('exam-1', null)).rejects.toMatchObject({ status: 500 });
  });

  it('answers a failed exam read from the local copy', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await db.exams.put(await encryptExam({ id: 'exam-1', title: 'Probe' } as ExamRecord, key));
    vi.mocked(api.get).mockRejectedValueOnce(failWith(500));
    await expect(examRepository.getById('exam-1', key)).resolves.toMatchObject({ id: 'exam-1', title: 'Probe' });
  });

  it('answers a failed exercise read from the local links', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await db.exercises.put(await encryptExercise({ id: 'ex-1', title: 'Aufgabe' } as ExerciseRecord, key));
    await db.examExercises.put({ examId: 'exam-1', exerciseId: 'ex-1', orderIndex: 0 } as never);
    vi.mocked(api.get).mockRejectedValueOnce(failWith(500));
    await expect(exerciseRepository.getByExamId('exam-1', key)).resolves.toMatchObject([{ id: 'ex-1', title: 'Aufgabe' }]);
  });

  it('throws a failed exercise read without a local copy instead of an empty list', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(failWith(500));
    await expect(exerciseRepository.getByExamId('exam-1', null)).rejects.toMatchObject({ status: 500 });
  });
});

describe('a failed local student delete in hybrid mode (issue #289)', () => {
  it('is reported, not swallowed', async () => {
    storagePolicyStore.setPolicy({ storageMode: 'hybrid', latexCompilation: 'local' });
    const student = { examId: 'exam-1', pseudonymHmac: 'p'.repeat(64), pseudonymVersion: 2 } as StudentRecord;
    await db.examStudents.put(student);
    const spy = vi.spyOn(db.examStudents, 'bulkDelete').mockRejectedValueOnce(new Error('IndexedDB failed'));

    await expect(studentRepository.delete(student, { permanent: true })).rejects.toThrow('IndexedDB failed');
    spy.mockRestore();
  });
});
