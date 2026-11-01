import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../src/lib/db/db';
import type { ExerciseScoreRecord, SubmissionRecord } from '../src/lib/db/schema';
import { submissionRepository } from '../src/lib/repositories/submissionRepository';
import { storagePolicyStore } from '../src/lib/stores/storagePolicy';
import { listLocalTrash, purgeLocalGroup, restoreLocalGroup, sweepLocalTrash } from '../src/lib/trash/localTrash';

vi.mock('../src/lib/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const EXAM = 'exam-1';
// Stored rows as the vault holds them; the trash never opens them, so their sealed fields are opaque here.
const submission = { id: 'sub-1', examId: EXAM, pseudonymHmac: 'p'.repeat(64), pseudonymVersion: 2, createdAt: '' } as SubmissionRecord;
const score = { id: 'score-1', submissionId: 'sub-1', exerciseId: 'ex-1', payloadCt: new Uint8Array([1]) } as ExerciseScoreRecord;

describe('browser trash (issue #125)', () => {
  beforeEach(async () => {
    await Promise.all([db.submissions.clear(), db.exerciseScores.clear(), db.trash.clear()]);
    storagePolicyStore.setPolicy({ storageMode: 'hybrid', latexCompilation: 'local' });
    await db.submissions.put(submission);
    await db.exerciseScores.put(score);
  });

  it('keeps a deleted submission with its scores and restores them as stored', async () => {
    await submissionRepository.delete(EXAM, 'sub-1', { group: 'g-1' });
    expect(await db.submissions.count()).toBe(0);
    expect(await db.exerciseScores.count()).toBe(0);

    const [entry] = await listLocalTrash();
    expect(entry).toMatchObject({ groupId: 'g-1', kind: 'submission', examId: EXAM, submissionId: 'sub-1' });

    const result = await restoreLocalGroup('g-1', null, async () => true);
    expect(result).toEqual({ restored: { scan_submissions: 1, exercise_scores: 1 }, skipped: [] });
    expect(await db.submissions.get('sub-1')).toEqual(submission);
    expect(await db.exerciseScores.get('score-1')).toEqual(score);
    expect(await listLocalTrash()).toEqual([]);
  });

  it('never overwrites a row that exists again and skips rows of a deleted exam', async () => {
    await submissionRepository.delete(EXAM, 'sub-1', { group: 'g-2' });
    await db.submissions.put({ ...submission, totalScore: 3 });
    const kept = await restoreLocalGroup('g-2', null, async () => true);
    expect(kept.skipped.map((s) => s.reason)).toEqual(['already_exists', 'already_exists']);
    expect((await db.submissions.get('sub-1'))?.totalScore).toBe(3);

    await submissionRepository.delete(EXAM, 'sub-1', { group: 'g-3' });
    const orphan = await restoreLocalGroup('g-3', null, async () => false);
    expect(orphan.skipped).toEqual([{ table: 'exams', id: EXAM, reason: 'parent_missing' }]);
    expect(await db.submissions.count()).toBe(0);
  });

  it('stores nothing for a permanent delete, erases on request and after the grace period', async () => {
    await submissionRepository.delete(EXAM, 'sub-1', { permanent: true });
    expect(await db.trash.count()).toBe(0);

    await db.submissions.put(submission);
    await submissionRepository.delete(EXAM, 'sub-1', { group: 'g-4' });
    await purgeLocalGroup('g-4');
    expect(await db.trash.count()).toBe(0);

    await db.submissions.put(submission);
    await submissionRepository.delete(EXAM, 'sub-1', { group: 'g-5' });
    await db.trash.toCollection().modify({ purgeAfter: new Date(Date.now() - 1000).toISOString() });
    await sweepLocalTrash();
    expect(await db.trash.count()).toBe(0);
  });
});
