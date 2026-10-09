import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../src/lib/db/db';
import { encryptExam } from '../src/lib/db/dbEncryption';
import { loadSyncedExams } from '../src/lib/services/examSync';
import { offlineQueue } from '../src/lib/services/offlineQueue';
import { api } from '../src/lib/api/client';
import type { ExamRecord } from '../src/lib/db/schema';

vi.mock('../src/lib/api/client', () => ({ api: { get: vi.fn() } }));
vi.mock('../src/lib/utils/serverBacked', () => ({ isServerBacked: () => true }));

const exam = (id: string): ExamRecord => ({
  id,
  teacherId: 't-1',
  title: id,
  retentionUntil: '2030-01-01',
  compilationStatus: 'pending',
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('loadSyncedExams', () => {
  let key: CryptoKey;

  beforeEach(async () => {
    await db.exams.clear();
    offlineQueue.set([]);
    key = await crypto.subtle.importKey('raw', new Uint8Array(32).fill(3), { name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ]);
  });

  it('compares the server list with IndexedDB: purges stale exams, keeps queued creations', async () => {
    await db.exams.bulkPut([await encryptExam(exam('stale'), key), await encryptExam(exam('pending'), key)]);
    offlineQueue.set([{ id: 'q1', url: '/exams', method: 'POST', body: { id: 'pending' }, timestamp: 0 }]);
    vi.mocked(api.get).mockResolvedValue([{ id: 'remote', title: 'remote', exercises: [], mc_groups: [] }]);

    const { exams, failed } = await loadSyncedExams(key);

    expect(failed).toBe(false);
    expect(exams.map((e) => e.id).sort()).toEqual(['pending', 'remote']);
    expect((await db.exams.toArray()).map((e) => e.id).sort()).toEqual(['pending', 'remote']);
  });

  it('falls back to the local copy when the server list fails', async () => {
    await db.exams.put(await encryptExam(exam('cached'), key));
    vi.mocked(api.get).mockRejectedValue(new Error('unreachable'));

    const { exams, failed } = await loadSyncedExams(key);

    expect(failed).toBe(true);
    expect(exams.map((e) => e.id)).toEqual(['cached']);
  });
});
