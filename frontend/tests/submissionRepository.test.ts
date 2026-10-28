import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapApiToSubmissionRecord, submissionRepository } from '../src/lib/repositories/submissionRepository';
import { api } from '../src/lib/api/client';
import { storagePolicyStore } from '../src/lib/stores/storagePolicy';

vi.mock('../src/lib/db/db', () => ({ db: { submissions: {}, exerciseScores: {} } }));

vi.mock('../src/lib/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

vi.mock('../src/lib/services/offlineQueue', () => ({
  enqueueRequest: vi.fn(),
  enqueueOrThrow: vi.fn(),
}));

describe('submissionRepository mapping', () => {
  it('maps a full API submission response to SubmissionRecord', () => {
    const raw = {
      id: 'sub-1',
      exam_id: 'exam-1',
      pseudonym_hmac: 'a'.repeat(64),
      total_score: 8.5,
      created_at: '2026-08-01T00:00:00Z',
      scan_ciphertext_b64: btoa('scan'),
      scan_iv_b64: btoa('iv1'),
      annotation_ciphertext_b64: btoa('ann'),
      annotation_iv_b64: btoa('iv2'),
    };

    const mapped = mapApiToSubmissionRecord(raw, 'fallback-exam-id');

    expect(mapped.id).toBe('sub-1');
    expect(mapped.examId).toBe('exam-1');
    expect(mapped.pseudonymHash).toBe(raw.pseudonym_hmac);
    expect(mapped.totalScore).toBe(8.5);
    expect(mapped.scanCt).toBeInstanceOf(Uint8Array);
  });

  it('falls back to the provided examId when exam_id is absent', () => {
    const mapped = mapApiToSubmissionRecord({ id: 'sub-2', pseudonym_hmac: 'b'.repeat(64) }, 'fallback-exam-id');
    expect(mapped.examId).toBe('fallback-exam-id');
  });
});

describe('submissionRepository server reads', () => {
  const failure = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

  beforeEach(() => {
    vi.clearAllMocks();
    storagePolicyStore.setPolicy({ storageMode: 'all-server', latexCompilation: 'server' });
  });

  it('getByExamId throws on a failed server read instead of answering "no submissions"', async () => {
    vi.mocked(api.get).mockRejectedValue(failure(500));
    await expect(submissionRepository.getByExamId('exam-1', null)).rejects.toThrow('HTTP 500');
  });

  it('getAll throws when any exam\'s submissions cannot be read, never a partial list', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.startsWith('/exams/a/')) return [{ id: 's1', pseudonym_hmac: 'h'.repeat(64) }];
      throw failure(503);
    });
    await expect(submissionRepository.getAll(null, [{ id: 'a' }, { id: 'b' }])).rejects.toThrow('HTTP 503');
  });

  it('getById is null only for a 404 and throws for any other failure', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(failure(404));
    expect(await submissionRepository.getById('exam-1', 'sub-1', null)).toBeNull();

    vi.mocked(api.get).mockRejectedValueOnce(failure(500));
    await expect(submissionRepository.getById('exam-1', 'sub-1', null)).rejects.toThrow('HTTP 500');
  });
});
