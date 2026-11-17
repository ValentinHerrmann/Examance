import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../src/lib/api/client';
import { db } from '../src/lib/db/db';
import type { StudentRecord } from '../src/lib/db/schema';
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
