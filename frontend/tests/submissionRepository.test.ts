import { describe, it, expect } from 'vitest';
import { mapApiToSubmissionRecord } from '../src/lib/repositories/submissionRepository';

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
