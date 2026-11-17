import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../src/lib/db/db';
import type { SubmissionRecord } from '../src/lib/db/schema';
import { submissionRepository } from '../src/lib/repositories/submissionRepository';
import { storagePolicyStore } from '../src/lib/stores/storagePolicy';

vi.mock('../src/lib/api/client', () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const EXAM = 'exam-1';
const bytes = (fill: number, length = 16) => new Uint8Array(length).fill(fill);

const bare = (scanFill = 1): SubmissionRecord => ({
  id: 'sub-1',
  examId: EXAM,
  pseudonymHmac: 'a'.repeat(64),
  pseudonymVersion: 2,
  scanCt: bytes(scanFill),
  scanIv: bytes(scanFill, 12),
  createdAt: '2026-08-01T00:00:00Z',
});

const graded = (): SubmissionRecord => ({ ...bare(), annotationCt: bytes(7), annotationIv: bytes(7, 12), totalScore: 12 });

describe('hybrid submission save keeps what the record leaves out (issue #282)', () => {
  let key: CryptoKey;
  const stored = () => submissionRepository.getById(EXAM, 'sub-1', key);

  beforeEach(async () => {
    await db.submissions.clear();
    storagePolicyStore.setPolicy({ storageMode: 'hybrid', latexCompilation: 'local' });
    key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await submissionRepository.save(graded(), key);
  });

  it('a bare scan record keeps the annotations and the total', async () => {
    await submissionRepository.save(bare(2), key);
    const row = await stored();
    expect(row?.scanCt).toEqual(bytes(2));
    expect(row?.annotationCt).toEqual(bytes(7));
    expect(row?.totalScore).toBe(12);
  });

  it('a record without a scan keeps the stored scan', async () => {
    const { scanCt: _ct, scanIv: _iv, ...noScan } = graded();
    await submissionRepository.save({ ...noScan, totalScore: 3 }, key);
    const row = await stored();
    expect(row?.scanCt).toEqual(bytes(1));
    expect(row?.totalScore).toBe(3);
  });

  it('clearAnnotations and clearTotal still clear', async () => {
    await submissionRepository.save(bare(), key, { clearAnnotations: true, clearTotal: true });
    const row = await stored();
    expect(row?.annotationCt).toBeUndefined();
    expect(row?.totalScore).toBeUndefined();
    expect(row?.scanCt).toEqual(bytes(1));
  });
});

describe('hybrid submission save edge cases (issue #282 review)', () => {
  let key: CryptoKey;
  const stored = () => submissionRepository.getById(EXAM, 'sub-1', key);

  beforeEach(async () => {
    await db.submissions.clear();
    storagePolicyStore.setPolicy({ storageMode: 'hybrid', latexCompilation: 'local' });
    key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  });

  it('a grading save with omitScan never writes its stale scan over a newer one', async () => {
    await submissionRepository.save(bare(2), key);
    await submissionRepository.save({ ...graded(), scanCt: bytes(1) }, key, { omitScan: true });
    const row = await stored();
    expect(row?.scanCt).toEqual(bytes(2));
    expect(row?.annotationCt).toEqual(bytes(7));
  });

  it('keeps the total of a legacy plaintext row', async () => {
    await db.submissions.put({ ...bare(), totalScore: 9 });
    await submissionRepository.save(bare(3), key);
    expect((await stored())?.totalScore).toBe(9);
  });
});
