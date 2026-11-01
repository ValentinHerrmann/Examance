import { describe, it, expect, beforeAll } from 'vitest';
import { buildSubmissionMap } from '../src/lib/utils/studentLookup';
import { keyFromRaw, pseudonymBase } from '../src/lib/crypto/pseudonymKey';
import { sessionStore } from '../src/lib/stores/session';
import type { StudentRecord, SubmissionRecord } from '../src/lib/db/schema';
import { hkdfMasterKey } from './helpers/keys';

const sub = (over: Partial<SubmissionRecord>): SubmissionRecord => ({
  id: 'sub-1',
  examId: 'exam-1',
  pseudonymHmac: 'pseudo-1',
  createdAt: new Date().toISOString(),
  ...over,
});

const student = (over: Partial<StudentRecord>): StudentRecord => ({
  examId: 'exam-1',
  pseudonymHmac: 'pseudo-1',
  piiCt: new Uint8Array(0),
  piiIv: new Uint8Array(12),
  ...over,
});

describe('studentLookup buildSubmissionMap', () => {
  beforeAll(async () => {
    const key = await crypto.subtle.importKey('raw', new Uint8Array(32).fill(3), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    await sessionStore.unlock({ masterKey: await hkdfMasterKey(), sessionKey: key, sessionNonce: new Uint8Array(12) });
  });

  it('maps a submission by its stored value and its id', async () => {
    const s = sub({});
    const map = await buildSubmissionMap([s], []);
    expect(map.get('pseudo-1')).toBe(s);
    expect(map.get('sub-1')).toBe(s);
  });

  it('links a raw student row to a keyed submission of the same pupil (issue #177)', async () => {
    const raw = '550e8400-e29b-41d4-a716-446655440000';
    const s = sub({ id: 'sub-scanned-1', pseudonymHmac: await keyFromRaw('exam-1', raw), pseudonymVersion: 2 });
    const st = student({ pseudonymHmac: raw, studentName: 'Test Student', fallbackCode: 'FBC1' });

    const map = await buildSubmissionMap([s], [st]);
    expect(map.get(raw)).toBe(s);
    expect(map.get('FBC1')).toBe(s);
  });

  it('links a SHA-256 student row (server, version 1) to a raw submission row of the same pupil', async () => {
    const raw = 'raw-pseudonym-123';
    const s = sub({ pseudonymHmac: raw });
    const st = student({ pseudonymHmac: await pseudonymBase(raw) });

    const map = await buildSubmissionMap([s], [st]);
    expect(map.get(st.pseudonymHmac)).toBe(s);
  });

  it('does not link the same raw value across exams: keys are per exam', async () => {
    const raw = 'same-sticker';
    const s = sub({ examId: 'exam-2', pseudonymHmac: await keyFromRaw('exam-2', raw), pseudonymVersion: 2 });
    const st = student({ examId: 'exam-1', pseudonymHmac: await keyFromRaw('exam-1', raw), pseudonymVersion: 2 });

    const map = await buildSubmissionMap([s], [st]);
    expect(map.has(st.pseudonymHmac)).toBe(false);
  });
});
