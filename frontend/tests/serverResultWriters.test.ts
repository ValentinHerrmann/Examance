import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExerciseScoreRecord, GradingReviewRecord, StudentRecord, SubmissionRecord } from '../src/lib/db/schema';

vi.mock('../src/lib/api/client', async (orig) => ({
  ...(await orig<typeof import('../src/lib/api/client')>()),
  api: { get: vi.fn(), post: vi.fn(async () => ({})), put: vi.fn(async () => ({})), patch: vi.fn(), delete: vi.fn() },
}));

const { api } = await import('../src/lib/api/client');
const { serverResultWriters } = await import('../src/lib/services/resultsMover');

const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

describe('serverResultWriters (issue #299)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes each kind to its endpoint, sealed and without the error pop-up', async () => {
    const student = { examId: 'e', pseudonymHmac: 'h', studentName: 'Adam, Lena', piiCt: new Uint8Array([0]), piiIv: new Uint8Array(12) } as StudentRecord;
    const submission = { id: 's1', examId: 'e', pseudonymHmac: 'h', createdAt: '2026-11-20T00:00:00Z' } as SubmissionRecord;
    const score = { id: 'r1', submissionId: 's1', exerciseId: 'x1', score: 2 } as ExerciseScoreRecord;
    const review = { id: 'v1', submissionId: 's1', items: [] } as unknown as GradingReviewRecord;

    await serverResultWriters.student('e', student, key);
    await serverResultWriters.submission('e', submission);
    await serverResultWriters.scores('e', 's1', [score], key);
    await serverResultWriters.review('e', review, key);

    expect(vi.mocked(api.post).mock.calls.map((c) => c[0])).toEqual(['/exams/e/students', '/exams/e/submissions']);
    expect(vi.mocked(api.put).mock.calls.map((c) => c[0])).toEqual(['/exams/e/submissions/s1/scores', '/exams/e/submissions/s1/grading-review']);
    for (const call of [...vi.mocked(api.post).mock.calls, ...vi.mocked(api.put).mock.calls]) expect(call[2]).toMatchObject({ silentError: true });
    const sentScores = (vi.mocked(api.put).mock.calls[0][1] as { scores: Record<string, unknown>[] }).scores;
    expect(sentScores).toHaveLength(1);
    expect(JSON.stringify(sentScores)).not.toContain('"score":2');
  });

  it('throws a refused write to the caller instead of queueing it', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(Object.assign(new Error('HTTP 422'), { status: 422 }));
    await expect(serverResultWriters.submission('e', { id: 's2', examId: 'e', pseudonymHmac: 'h', createdAt: '' } as SubmissionRecord)).rejects.toThrow('HTTP 422');
  });
});
