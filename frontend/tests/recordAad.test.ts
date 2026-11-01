import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { describe, expect, it, vi } from 'vitest';

import {
  decryptAuditEntry,
  decryptExam,
  decryptExercise,
  decryptOmrTemplate,
  decryptResourceBytes,
  decryptStudent,
  decryptSubmission,
  encryptAuditEntry,
  encryptExam,
  encryptExercise,
  encryptOmrTemplate,
  encryptResource,
  encryptStudent,
  encryptSubmission,
  openAnnotation,
  openScan,
  sealAnnotation,
  sealScan,
} from '../src/lib/db/dbEncryption';
import { encrypt } from '../src/lib/crypto/aesGcm';
import { MissingSessionKeyError } from '../src/lib/db/decryptGuard';
import type { ExerciseResourceRecord, StudentRecord } from '../src/lib/db/schema';

// Issue #178 (S11): every ciphertext is bound to its record; one moved to another record must not open, a legacy one still does.
async function aesKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new Uint8Array(32).fill(7), { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

const bytes = new TextEncoder().encode('%PDF-1.7 sample');

interface CodecCase {
  kind: string;
  record: any;
  moved: Record<string, unknown>;
  seal: (record: any, key: CryptoKey | null) => Promise<any>;
  open: (record: any, key: CryptoKey | null) => Promise<any>;
  field: string;
}

describe('record codecs bind their payload to the record id', () => {
  const cases: CodecCase[] = [
    {
      kind: 'exam',
      record: { id: 'exam-A', teacherId: 't', retentionUntil: '2030-01-01', title: 'Mathe' } as any,
      moved: { id: 'exam-B' },
      seal: encryptExam,
      open: decryptExam,
      field: 'title',
    },
    {
      kind: 'exercise',
      record: { id: 'ex-A', latexBody: 'x^2' } as any,
      moved: { id: 'ex-B' },
      seal: encryptExercise,
      open: decryptExercise,
      field: 'latexBody',
    },
    {
      kind: 'submission',
      record: { id: 'sub-A', examId: 'e', pseudonymHmac: 'p', createdAt: '', totalScore: 9 } as any,
      moved: { id: 'sub-B' },
      seal: encryptSubmission,
      open: decryptSubmission,
      field: 'totalScore',
    },
    {
      kind: 'audit entry',
      record: { id: 'a-A', action: 'DELETE', targetId: 'x', timestamp: '', note: 'GDPR' } as any,
      moved: { id: 'a-B' },
      seal: encryptAuditEntry,
      open: decryptAuditEntry,
      field: 'note',
    },
    {
      kind: 'keyed student',
      record: { examId: 'e', pseudonymHmac: 'k'.repeat(64), pseudonymVersion: 2, studentName: 'Anna', piiCt: new Uint8Array(0), piiIv: new Uint8Array(12) } as StudentRecord,
      moved: { pseudonymHmac: 'm'.repeat(64) },
      seal: encryptStudent,
      open: decryptStudent,
      field: 'studentName',
    },
  ];

  for (const c of cases) {
    it(`${c.kind}: round-trips, and a payload moved to another record fails`, async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const key = await aesKey();
      const sealed = await c.seal(c.record, key);
      expect((await c.open(sealed, key))[c.field]).toBe(c.record[c.field]);
      const moved = await c.open({ ...sealed, ...c.moved }, key);
      expect(moved.decryptFailed).toBe('error');
      // Never re-encrypted: assertEncryptable refuses a record that did not open.
      await expect(c.seal(moved, key)).rejects.toThrow();
    });
  }

  it('a version-1 student carries no binding, so the server-side rename of the re-key never strands it', async () => {
    const key = await aesKey();
    const v1: StudentRecord = { examId: 'e', pseudonymHmac: 'raw-id', studentName: 'Ben', piiCt: new Uint8Array(0), piiIv: new Uint8Array(12) };
    const sealed = await encryptStudent(v1, key);
    const renamed = await decryptStudent({ ...sealed, pseudonymHmac: 'k'.repeat(64), pseudonymVersion: 2 }, key);
    expect(renamed.studentName).toBe('Ben');
  });

  it('still opens a payload sealed before its codec gained the binding', async () => {
    const key = await aesKey();
    const { ciphertext, iv } = await encrypt(key, new TextEncoder().encode(JSON.stringify({ title: 'Alt' })));
    const opened = await decryptExam({ id: 'exam-A', teacherId: 't', retentionUntil: '', payloadCt: ciphertext, payloadIv: iv } as any, key);
    expect(opened.decryptFailed).toBeUndefined();
    expect(opened.title).toBe('Alt');
  });
});

describe('scans, annotations, resources and OMR templates are bound too', () => {
  it('a scan or annotation opens only for its own submission', async () => {
    const key = await aesKey();
    for (const [seal, open] of [
      [sealScan, openScan],
      [sealAnnotation, openAnnotation],
    ] as const) {
      const { ct, iv } = await seal('SUB-A', bytes, key);
      expect(await open('sub-a', ct, iv, key)).toEqual(bytes);
      await expect(open('sub-b', ct, iv, key)).rejects.toThrow();
    }
  });

  it('a legacy scan without binding still opens', async () => {
    const key = await aesKey();
    const { ciphertext, iv } = await encrypt(key, bytes);
    expect(await openScan('sub-a', ciphertext, iv, key)).toEqual(bytes);
  });

  it('refuses to seal a scan without a key', async () => {
    await expect(sealScan('sub-a', bytes, null)).rejects.toBeInstanceOf(MissingSessionKeyError);
  });

  it('a resource follows its id, not its exercise or file name (commit and rename move rows unsealed)', async () => {
    const key = await aesKey();
    const res: ExerciseResourceRecord = { id: 'r-A', exerciseId: 'ex-1', filename: 'a.png', mimeType: 'image/png', byteSize: bytes.length } as ExerciseResourceRecord;
    const sealed = await encryptResource(res, bytes, key);
    expect(await decryptResourceBytes({ ...sealed, exerciseId: 'ex-2', filename: 'b.png' }, key)).toEqual(bytes);
    await expect(decryptResourceBytes({ ...sealed, id: 'r-B' }, key)).rejects.toThrow();
  });

  it('an OMR template opens only for its exam', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const key = await aesKey();
    const tpl = { id: 'exam-A', examId: 'exam-A', exercisesHash: 'h', createdAt: '' };
    const sealed = await encryptOmrTemplate(tpl, key, { pages: [] } as never);
    expect(await decryptOmrTemplate(sealed, key)).toEqual({ pages: [] });
    expect(await decryptOmrTemplate({ ...sealed, examId: 'exam-B' }, key)).toBeNull();
  });
});
