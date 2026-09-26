import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../src/lib/db/db';
import { scoreRepository } from '../src/lib/repositories/scoreRepository';
import { storagePolicyStore } from '../src/lib/stores/storagePolicy';
import { offlineQueue } from '../src/lib/services/offlineQueue';
import { api } from '../src/lib/api/client';

vi.mock('../src/lib/api/client', () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

async function aesKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new Uint8Array(32).fill(5),
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

describe('scoreRepository', () => {
  let key: CryptoKey;

  beforeEach(async () => {
    vi.clearAllMocks();
    await db.exerciseScores.clear();
    await db.submissions.clear();
    offlineQueue.set([]);
    storagePolicyStore.setPolicy({ storageMode: 'all-local', latexCompilation: 'local' });
    key = await aesKey();
  });

  it('round-trips a score through the local store', async () => {
    await scoreRepository.saveMany(
      'exam-1',
      'sub-1',
      [{ id: 'sc-1', submissionId: 'sub-1', exerciseId: 'ex-1', score: 4 }],
      key
    );

    const read = await scoreRepository.getBySubmissionId('exam-1', 'sub-1', key);
    expect(read).toHaveLength(1);
    expect(read[0].score).toBe(4);
    expect(read[0].exerciseId).toBe('ex-1');
  });

  it('never stores a plaintext score in IndexedDB', async () => {
    await scoreRepository.saveMany(
      'exam-1',
      'sub-1',
      [{ id: 'sc-1', submissionId: 'sub-1', exerciseId: 'ex-1', score: 4, selectedOptions: [2] }],
      key
    );

    const [raw] = await db.exerciseScores.toArray();
    expect(raw.score).toBeUndefined();
    expect(raw.selectedOptions).toBeUndefined();
    expect(raw.payloadCt).toBeInstanceOf(Uint8Array);
  });

  it('reconciles on (submission, exercise) so a re-save does not duplicate', async () => {
    await scoreRepository.saveMany(
      'exam-1',
      'sub-1',
      [{ id: 'first-uuid', submissionId: 'sub-1', exerciseId: 'ex-1', score: 4 }],
      key
    );
    // A fresh client-side uuid for an exercise already scored used to leave two
    // rows behind, and the totals counted both.
    await scoreRepository.saveMany(
      'exam-1',
      'sub-1',
      [{ id: 'second-uuid', submissionId: 'sub-1', exerciseId: 'ex-1', score: 5 }],
      key
    );

    const rows = await db.exerciseScores.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('first-uuid');
    const read = await scoreRepository.getBySubmissionId('exam-1', 'sub-1', key);
    expect(read[0].score).toBe(5);
  });

  it('scopes an exam read to that exam only', async () => {
    await db.submissions.bulkPut([
      { id: 'sub-1', examId: 'exam-1', pseudonymHash: 'a', createdAt: '' },
      { id: 'sub-2', examId: 'exam-2', pseudonymHash: 'b', createdAt: '' },
    ]);
    await scoreRepository.saveMany(
      'exam-1',
      'sub-1',
      [{ id: 'sc-1', submissionId: 'sub-1', exerciseId: 'ex-1', score: 1 }],
      key
    );
    await scoreRepository.saveMany(
      'exam-2',
      'sub-2',
      [{ id: 'sc-2', submissionId: 'sub-2', exerciseId: 'ex-2', score: 2 }],
      key
    );

    const scoped = await scoreRepository.getByExamId('exam-1', key);
    expect(scoped.map((s) => s.exerciseId)).toEqual(['ex-1']);
  });

  it('hybrid keeps scores local, like submissions and students', async () => {
    storagePolicyStore.setPolicy({ storageMode: 'hybrid', latexCompilation: 'local' });
    await scoreRepository.saveMany(
      'exam-1',
      'sub-1',
      [{ id: 'sc-1', submissionId: 'sub-1', exerciseId: 'ex-1', score: 3 }],
      key
    );

    expect(api.put).not.toHaveBeenCalled();
    expect(await db.exerciseScores.count()).toBe(1);
  });

  it('PUTs in server mode and never touches the local store', async () => {
    storagePolicyStore.setPolicy({ storageMode: 'all-server', latexCompilation: 'local' });
    vi.mocked(api.put).mockResolvedValue(undefined as never);

    await scoreRepository.saveMany(
      'exam-1',
      'sub-1',
      [{ id: 'sc-1', submissionId: 'sub-1', exerciseId: 'ex-1', score: 3 }],
      key
    );

    expect(api.put).toHaveBeenCalledWith(
      '/exams/exam-1/submissions/sub-1/scores',
      expect.objectContaining({ scores: expect.any(Array) }),
      { silentError: true }
    );
    expect(await db.exerciseScores.count()).toBe(0);
  });

  it('queues a failed server write as a replayable PUT', async () => {
    storagePolicyStore.setPolicy({ storageMode: 'all-server', latexCompilation: 'local' });
    vi.mocked(api.put).mockRejectedValue(new Error('offline'));

    await scoreRepository.saveMany(
      'exam-1',
      'sub-1',
      [{ id: 'sc-1', submissionId: 'sub-1', exerciseId: 'ex-1', score: 3 }],
      key
    );

    let queued: { method: string; url: string }[] = [];
    offlineQueue.subscribe((q) => (queued = q))();
    // PUT, not POST: the row is keyed by (submission, exercise) server-side, so
    // replaying the write updates in place instead of colliding.
    expect(queued).toHaveLength(1);
    expect(queued[0].method).toBe('PUT');
    expect(queued[0].url).toBe('/exams/exam-1/submissions/sub-1/scores');
  });
});
