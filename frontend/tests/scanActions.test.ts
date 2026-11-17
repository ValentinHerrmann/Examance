import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';

import { db } from '../src/lib/db/db';
import { openScan, sealScan } from '../src/lib/db/dbEncryption';
import type { ExerciseScoreRecord, OmrScoreMeta, StudentRecord, SubmissionRecord } from '../src/lib/db/schema';
import { scoreRepository } from '../src/lib/repositories/scoreRepository';
import { studentRepository } from '../src/lib/repositories/studentRepository';
import { submissionRepository } from '../src/lib/repositories/submissionRepository';
import { deleteScans, splitScan, SplitRefused } from '../src/lib/scan/scanActions';
import { sessionStore } from '../src/lib/stores/session';
import { storagePolicyStore } from '../src/lib/stores/storagePolicy';
import { hkdfMasterKey } from './helpers/keys';
import { api } from '../src/lib/api/client';
import { offlineQueue } from '../src/lib/services/offlineQueue';
import { uint8ArrayToBase64 } from '../src/lib/crypto/aesGcm';

vi.mock('../src/lib/api/client', () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const EXAM = 'exam-1';
const HMAC = 'a'.repeat(64);

const mcRow = (exerciseId: string, pageIndex: number): ExerciseScoreRecord => ({
  id: `row-${exerciseId}`,
  submissionId: 'sub-1',
  exerciseId,
  score: 1,
  selectedOptions: [0],
  omrMeta: { confidence: 'high', source: 'omr', detections: { pageIndex, bubbles: [] } } as unknown as OmrScoreMeta,
});

describe('scan split and delete (issue #292)', () => {
  let key: CryptoKey;

  const pageCount = async (sub: SubmissionRecord | null) =>
    (await PDFDocument.load(await openScan(sub!.id, sub!.scanCt!, sub!.scanIv!, key))).getPageCount();

  async function storeScan(id: string, pages: number, pseudonymHmac = HMAC) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage();
    const { ct, iv } = await sealScan(id, await doc.save(), key);
    await submissionRepository.save({ id, examId: EXAM, pseudonymHmac, pseudonymVersion: 2, scanCt: ct, scanIv: iv, createdAt: '2026-11-01T00:00:00Z' }, key);
  }

  beforeEach(async () => {
    await Promise.all([db.submissions.clear(), db.exerciseScores.clear(), db.examStudents.clear(), db.trash.clear()]);
    storagePolicyStore.setPolicy({ storageMode: 'hybrid', latexCompilation: 'local' });
    key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await sessionStore.unlock({ masterKey: await hkdfMasterKey(), sessionKey: key, sessionNonce: new Uint8Array(12) });
    await storeScan('sub-1', 4);
  });

  afterEach(() => vi.restoreAllMocks());

  const item = { id: 'sub-1', pseudonymHmac: HMAC, pseudonymVersion: 2 as const, createdAt: '2026-11-01T00:00:00Z' };

  it('moves the later pages and their MC rows to a second submission', async () => {
    await scoreRepository.saveMany(EXAM, 'sub-1', [mcRow('ex-early', 0), mcRow('ex-late', 3)], key);
    await expect(splitScan(EXAM, item, 3, { key })).resolves.toEqual({ firstEnd: 2, secondStart: 3, totalPages: 4 });

    const subs = await submissionRepository.getByExamId(EXAM, key);
    const part2 = subs.find((s) => s.id !== 'sub-1')!;
    expect(await pageCount(await submissionRepository.getById(EXAM, 'sub-1', key))).toBe(2);
    expect(await pageCount(await submissionRepository.getById(EXAM, part2.id, key))).toBe(2);
    expect((await scoreRepository.getBySubmissionId(EXAM, 'sub-1', key)).map((r) => r.exerciseId)).toEqual(['ex-early']);
    const moved = await scoreRepository.getBySubmissionId(EXAM, part2.id, key);
    expect(moved).toMatchObject([{ exerciseId: 'ex-late', omrMeta: { detections: { pageIndex: 1 } } }]);
  });

  it('leaves the original untouched when the second part cannot be stored', async () => {
    vi.spyOn(submissionRepository, 'save').mockRejectedValueOnce(new Error('offline'));
    await expect(splitScan(EXAM, item, 3, { key })).rejects.toThrow('offline');
    expect(await pageCount(await submissionRepository.getById(EXAM, 'sub-1', key))).toBe(4);
  });

  it('refuses a scan with hand grading', async () => {
    await scoreRepository.saveMany(EXAM, 'sub-1', [{ id: 'r', submissionId: 'sub-1', exerciseId: 'ex-1', score: 2 }], key);
    await expect(splitScan(EXAM, item, 3, { key })).rejects.toBeInstanceOf(SplitRefused);
    expect(await pageCount(await submissionRepository.getById(EXAM, 'sub-1', key))).toBe(4);
  });

  it('keeps a student another scan still uses, and deletes them with the last one', async () => {
    const student = { examId: EXAM, pseudonymHmac: HMAC, pseudonymVersion: 2, fallbackCode: 'X', piiCt: new Uint8Array([0]), piiIv: new Uint8Array(12) } as StudentRecord;
    await studentRepository.save(student, key);
    await storeScan('sub-2', 1);
    const group = 'g-1';

    await deleteScans(EXAM, [item], { group, key });
    expect(await studentRepository.getByExamId(EXAM, key)).toHaveLength(1);

    await deleteScans(EXAM, [{ ...item, id: 'sub-2' }], { group, key });
    expect(await studentRepository.getByExamId(EXAM, key)).toHaveLength(0);
  });

  it('all-server: a failed second-part save is never queued and the original is not shrunk', async () => {
    storagePolicyStore.setPolicy({ storageMode: 'all-server', latexCompilation: 'server' });
    offlineQueue.set([]);
    const doc = await PDFDocument.create();
    for (let i = 0; i < 4; i++) doc.addPage();
    const { ct, iv } = await sealScan('sub-1', await doc.save(), key);
    vi.mocked(api.get).mockImplementation(async (path: string) =>
      (path.endsWith('/scores')
        ? []
        : { id: 'sub-1', exam_id: EXAM, pseudonym_hmac: HMAC, pseudonym_version: 2, scan_ciphertext_b64: uint8ArrayToBase64(ct), scan_iv_b64: uint8ArrayToBase64(iv), created_at: item.createdAt }) as never,
    );
    const unavailable = Object.assign(new Error('HTTP 503'), { status: 503 });
    vi.mocked(api.post).mockImplementation(async (path: string) => {
      if (path.endsWith('/submissions')) throw unavailable;
      return undefined as never;
    });

    await expect(splitScan(EXAM, item, 3, { key })).rejects.toThrow('HTTP 503');
    const submissionPosts = vi.mocked(api.post).mock.calls.filter(([path]) => String(path).endsWith('/submissions'));
    expect(submissionPosts).toHaveLength(1);
    expect(submissionPosts[0][1]).not.toMatchObject({ id: 'sub-1' });
    let queued: unknown[] = [];
    offlineQueue.subscribe((q) => (queued = q))();
    expect(queued.filter((q: any) => String(q.url).endsWith('/submissions'))).toHaveLength(0);
  });
});
