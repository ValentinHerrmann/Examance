import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { describe, expect, it, vi } from 'vitest';

import { decryptScore, encryptScore } from '../src/lib/db/dbEncryption';
import { encrypt } from '../src/lib/crypto/aesGcm';
import type { ExerciseScoreRecord } from '../src/lib/db/schema';

async function aesKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new Uint8Array(32).fill(7), { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

const score = (): ExerciseScoreRecord => ({
  id: 'sc-1',
  submissionId: 'sub-A',
  exerciseId: 'ex-1',
  score: 2,
  selectedOptions: [0, 2],
  omrMeta: { confidence: 'high', source: 'omr' },
});

describe('score payload bound to its row (issue #85)', () => {
  it('round-trips', async () => {
    const key = await aesKey();
    const opened = await decryptScore(await encryptScore(score(), key), key);
    expect(opened.decryptFailed).toBeUndefined();
    expect(opened.selectedOptions).toEqual([0, 2]);
  });

  it('refuses a payload moved to another submission or exercise', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const key = await aesKey();
    const sealed = await encryptScore(score(), key);
    for (const moved of [{ ...sealed, submissionId: 'sub-B' }, { ...sealed, exerciseId: 'ex-2' }]) {
      const opened = await decryptScore(moved, key);
      expect(opened.decryptFailed).toBe('error');
      expect(opened.selectedOptions).toBeUndefined();
    }
  });

  it('still opens a payload sealed before the binding existed', async () => {
    const key = await aesKey();
    const payload = new TextEncoder().encode(JSON.stringify({ score: 1, selectedOptions: [3] }));
    const { ciphertext, iv } = await encrypt(key, payload);
    const opened = await decryptScore(
      { id: 'sc-1', submissionId: 'sub-A', exerciseId: 'ex-1', payloadCt: ciphertext, payloadIv: iv },
      key
    );
    expect(opened.decryptFailed).toBeUndefined();
    expect(opened.score).toBe(1);
  });
});
