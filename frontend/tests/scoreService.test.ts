import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../src/lib/db/db';
import { saveSubmissionScores } from '../src/lib/grading/scoreService';
import type { ExerciseScoreRecord, SubmissionRecord } from '../src/lib/db/schema';
import { scoreRepository } from '../src/lib/repositories/scoreRepository';
import { submissionRepository } from '../src/lib/repositories/submissionRepository';
import { offlineQueue } from '../src/lib/services/offlineQueue';
import { sessionStore } from '../src/lib/stores/session';
import { storagePolicyStore } from '../src/lib/stores/storagePolicy';
import { api } from '../src/lib/api/client';

vi.mock('../src/lib/api/client', () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const EXAM = 'exam-1';
const OMR_META = { confidence: 'high' as const, source: 'omr' as const };

async function aesKey(fill: number): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new Uint8Array(32).fill(fill), { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

const newSubmission = (): SubmissionRecord => ({
  id: 'sub-1',
  examId: EXAM,
  pseudonymHash: 'a'.repeat(64),
  createdAt: '2026-08-01T00:00:00Z',
});

const scoreRow = (exerciseId: string, score: number, extra: Partial<ExerciseScoreRecord> = {}): ExerciseScoreRecord => ({
  id: `row-${exerciseId}`,
  submissionId: 'sub-1',
  exerciseId,
  score,
  ...extra,
});

describe('saveSubmissionScores', () => {
  let key: CryptoKey;
  let sub: SubmissionRecord;

  const stored = async (exerciseId: string) =>
    (await scoreRepository.getBySubmissionId(EXAM, 'sub-1', key)).find((r) => r.exerciseId === exerciseId);
  const storedTotal = async () => (await submissionRepository.getById(EXAM, 'sub-1', key))?.totalScore;

  beforeEach(async () => {
    vi.clearAllMocks();
    await db.exerciseScores.clear();
    await db.submissions.clear();
    offlineQueue.set([]);
    // Hybrid keeps results in IndexedDB.
    storagePolicyStore.setPolicy({ storageMode: 'hybrid', latexCompilation: 'local' });
    key = await aesKey(5);
    await sessionStore.unlock({ masterKey: key, sessionKey: key, sessionNonce: new Uint8Array(12) });
    sub = newSubmission();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps an OMR row whose value is null and counts its score toward the total', async () => {
    await scoreRepository.saveMany(
      EXAM,
      'sub-1',
      [scoreRow('ex-1', 2, { selectedOptions: [1], omrMeta: OMR_META })],
      key,
    );
    const deleteOne = vi.spyOn(scoreRepository, 'deleteOne');

    const effective = await saveSubmissionScores(
      EXAM,
      sub,
      ['ex-1', 'ex-2'],
      new Map([
        ['ex-1', null],
        ['ex-2', 3],
      ]),
    );

    expect(deleteOne).not.toHaveBeenCalled();
    expect(effective.get('ex-1')).toBe(2);
    expect(effective.get('ex-2')).toBe(3);
    expect((await stored('ex-1'))?.omrMeta).toEqual(OMR_META);
    expect(sub.totalScore).toBe(5);
    expect(await storedTotal()).toBe(5);
  });

  it('clears a plain row whose value is null', async () => {
    await scoreRepository.saveMany(EXAM, 'sub-1', [scoreRow('ex-1', 2)], key);
    const deleteOne = vi.spyOn(scoreRepository, 'deleteOne');

    const effective = await saveSubmissionScores(EXAM, sub, ['ex-1'], new Map([['ex-1', null]]));

    expect(deleteOne).toHaveBeenCalledWith(EXAM, 'sub-1', 'ex-1');
    expect(effective.get('ex-1')).toBeNull();
    expect(await stored('ex-1')).toBeUndefined();
    expect(sub.totalScore).toBeUndefined();
  });

  it('stores live part scores, keeps them while the total matches and drops them when it was overridden (issue #187)', async () => {
    await saveSubmissionScores(EXAM, sub, ['ex-1'], new Map([['ex-1', 3]]), { parts: { 'ex-1': { a: 1, b: 2 } } });
    expect((await stored('ex-1'))?.partScores).toEqual({ a: 1, b: 2 });

    // A view that edits only totals keeps the stored parts while they still add up.
    await saveSubmissionScores(EXAM, sub, ['ex-1'], new Map([['ex-1', 3]]));
    expect((await stored('ex-1'))?.partScores).toEqual({ a: 1, b: 2 });

    await saveSubmissionScores(EXAM, sub, ['ex-1'], new Map([['ex-1', 4]]));
    expect((await stored('ex-1'))?.partScores).toBeUndefined();
    expect((await stored('ex-1'))?.score).toBe(4);
  });

  it('never deletes a row that failed to decrypt', async () => {
    // Sealed under another key: it opens as `decryptFailed`, which only looks ungraded.
    await scoreRepository.saveMany(EXAM, 'sub-1', [scoreRow('ex-1', 4)], await aesKey(9));
    const [before] = await db.exerciseScores.toArray();
    expect((await stored('ex-1'))?.decryptFailed).toBe('error');
    const deleteOne = vi.spyOn(scoreRepository, 'deleteOne');
    const saveMany = vi.spyOn(scoreRepository, 'saveMany');

    const effective = await saveSubmissionScores(EXAM, sub, ['ex-1'], new Map([['ex-1', null]]));

    expect(deleteOne).not.toHaveBeenCalled();
    expect(saveMany.mock.calls.every(([, , rows]) => rows.length === 0)).toBe(true);
    expect(effective.get('ex-1')).toBeNull();
    const rows = await db.exerciseScores.toArray();
    expect(rows).toHaveLength(1);
    expect(Array.from(rows[0].payloadCt ?? [])).toEqual(Array.from(before.payloadCt ?? []));
    expect(sub.totalScore).toBeUndefined();
  });

  it('carries selectedOptions and omrMeta forward when a value is saved', async () => {
    await scoreRepository.saveMany(
      EXAM,
      'sub-1',
      [scoreRow('ex-1', 1, { selectedOptions: [1, 2], omrMeta: OMR_META })],
      key,
    );

    await saveSubmissionScores(EXAM, sub, ['ex-1'], new Map([['ex-1', 4]]));

    const row = await stored('ex-1');
    expect(row?.score).toBe(4);
    expect(row?.selectedOptions).toEqual([1, 2]);
    expect(row?.omrMeta).toEqual(OMR_META);
  });

  it('leaves an exercise missing from the values untouched', async () => {
    await scoreRepository.saveMany(EXAM, 'sub-1', [scoreRow('ex-1', 2)], key);
    const deleteOne = vi.spyOn(scoreRepository, 'deleteOne');
    const saveMany = vi.spyOn(scoreRepository, 'saveMany');

    const effective = await saveSubmissionScores(EXAM, sub, ['ex-1', 'ex-2'], new Map([['ex-2', 3]]));

    expect(deleteOne).not.toHaveBeenCalled();
    expect(saveMany.mock.calls[0][2].map((r) => r.exerciseId)).toEqual(['ex-2']);
    expect(effective.get('ex-1')).toBe(2);
    expect((await stored('ex-1'))?.score).toBe(2);
    expect(sub.totalScore).toBe(5);
  });

  it('sets the total only once every exercise has a score, rounded to 2 decimals', async () => {
    const ids = ['ex-1', 'ex-2', 'ex-3'];

    await saveSubmissionScores(
      EXAM,
      sub,
      ids,
      new Map([
        ['ex-1', 0.1],
        ['ex-2', 0.2],
      ]),
    );
    expect(sub.totalScore).toBeUndefined();
    expect(await storedTotal()).toBeUndefined();

    await saveSubmissionScores(EXAM, sub, ids, new Map([['ex-3', 0.333]]));
    expect(sub.totalScore).toBe(0.63);
    expect(await storedTotal()).toBe(0.63);

    // Clearing one score takes the total away again.
    await saveSubmissionScores(EXAM, sub, ids, new Map([['ex-3', null]]));
    expect(sub.totalScore).toBeUndefined();
    expect(await storedTotal()).toBeUndefined();
  });

  it('does not PATCH a total in hybrid mode', async () => {
    await saveSubmissionScores(EXAM, sub, ['ex-1', 'ex-2'], new Map([['ex-1', 2]]));

    expect(api.patch).not.toHaveBeenCalled();
  });

  describe('all-server', () => {
    beforeEach(() => {
      storagePolicyStore.setPolicy({ storageMode: 'all-server', latexCompilation: 'local' });
      vi.mocked(api.put).mockResolvedValue(undefined as never);
      vi.mocked(api.post).mockResolvedValue(undefined as never);
      vi.mocked(api.patch).mockResolvedValue(undefined as never);
    });

    it('clears the server total (PATCH total_score null) when not fully graded', async () => {
      await saveSubmissionScores(EXAM, sub, ['ex-1', 'ex-2'], new Map([['ex-1', 2]]), { existing: new Map() });

      expect(sub.totalScore).toBeUndefined();
      expect(api.patch).toHaveBeenCalledWith(
        `/exams/${EXAM}/submissions/sub-1/score`,
        { total_score: null },
        { silentError: true },
      );
    });

    it('sends the total with the submission and no clearing PATCH when fully graded', async () => {
      await saveSubmissionScores(
        EXAM,
        sub,
        ['ex-1', 'ex-2'],
        new Map([
          ['ex-1', 2],
          ['ex-2', 3.5],
        ]),
        { existing: new Map() },
      );

      expect(api.post).toHaveBeenCalledWith(
        `/exams/${EXAM}/submissions`,
        expect.objectContaining({ id: 'sub-1', total_score: 5.5 }),
        { silentError: true },
      );
      expect(api.patch).not.toHaveBeenCalled();
    });
  });
});
