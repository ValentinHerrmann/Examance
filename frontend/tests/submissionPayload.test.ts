import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { submissionServerPayload } from '../src/lib/repositories/submissionRepository';
import type { SubmissionRecord } from '../src/lib/db/schema';

const sub = {
  id: 'sub-1',
  examId: 'exam-1',
  pseudonymHmac: 'p',
  pseudonymVersion: 2,
  scanCt: new Uint8Array([1, 2, 3]),
  scanIv: new Uint8Array(12),
  annotationCt: new Uint8Array([4]),
  annotationIv: new Uint8Array(12),
} as unknown as SubmissionRecord;

describe('submissionServerPayload', () => {
  it('sends the scan by default', async () => {
    const payload = await submissionServerPayload(sub);
    expect(payload.scan_ciphertext_b64).toBeDefined();
    expect(payload.scan_iv_b64).toBeDefined();
  });

  // Regression (issue #233): every grading save uploaded the whole sealed scan again.
  it('leaves the stored scan untouched with omitScan, but still sends the annotations', async () => {
    const payload = await submissionServerPayload(sub, { omitScan: true });
    expect(payload.scan_ciphertext_b64).toBeUndefined();
    expect(payload.scan_iv_b64).toBeUndefined();
    expect(payload.annotation_ciphertext_b64).toBeDefined();
  });
});
