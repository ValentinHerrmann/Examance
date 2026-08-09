import { describe, it, expect } from 'vitest';
import { buildSubmissionMap } from '../src/lib/utils/studentLookup';
import { ensure64CharHex } from '../src/lib/crypto/hmac';
import type { StudentRecord, SubmissionRecord } from '../src/lib/db/schema';

describe('studentLookup buildSubmissionMap', () => {
  it('maps submission by raw pseudonymHash and id', async () => {
    const sub: SubmissionRecord = {
      id: 'sub-1',
      examId: 'exam-1',
      pseudonymHash: 'pseudo-hash-1',
      createdAt: new Date().toISOString()
    };

    const map = await buildSubmissionMap([sub], []);
    expect(map.get('pseudo-hash-1')).toBe(sub);
    expect(map.get('sub-1')).toBe(sub);
  });

  it('maps submission by 64-character HMAC hash', async () => {
    const sub: SubmissionRecord = {
      id: 'sub-1',
      examId: 'exam-1',
      pseudonymHash: 'raw-pseudonym-123',
      createdAt: new Date().toISOString()
    };

    const map = await buildSubmissionMap([sub], []);
    const hmac = await ensure64CharHex('raw-pseudonym-123');
    expect(map.get(hmac)).toBe(sub);
  });

  it('cross-maps student raw pseudonymId and fallbackCode to matched submission', async () => {
    const rawPseudonym = '550e8400-e29b-41d4-a716-446655440000';
    const pseudonymHmac = await ensure64CharHex(rawPseudonym);

    const sub: SubmissionRecord = {
      id: 'sub-scanned-1',
      examId: 'exam-1',
      pseudonymHash: pseudonymHmac,
      scanCt: new Uint8Array([1, 2, 3]),
      scanIv: new Uint8Array(12),
      createdAt: new Date().toISOString()
    };

    const student: StudentRecord = {
      pseudonymId: rawPseudonym,
      examId: 'exam-1',
      studentName: 'Test Student',
      fallbackCode: 'FBC1',
      piiCt: new Uint8Array(0),
      piiIv: new Uint8Array(12)
    };

    const map = await buildSubmissionMap([sub], [student]);
    expect(map.get(rawPseudonym)).toBe(sub);
    expect(map.get('FBC1')).toBe(sub);
  });
});
