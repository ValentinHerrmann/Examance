import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { beforeEach, describe, expect, it } from 'vitest';

import {
  DecryptFailedError,
  MissingSessionKeyError,
  clearDecryptFailed,
  isDecryptFailed,
} from '../src/lib/db/decryptGuard';
import {
  decryptExam,
  encryptExam,
  encryptScore,
  encryptSubmission,
} from '../src/lib/db/dbEncryption';
import { vaultIntegrityStore } from '../src/lib/stores/vaultIntegrity';
import type { ExamRecord } from '../src/lib/db/schema';

async function aesKey(fill: number): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new Uint8Array(32).fill(fill),
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

const baseExam = (): ExamRecord => ({
  id: 'exam-1',
  teacherId: 'teacher-1',
  retentionUntil: '2027-12-31',
  compilationStatus: 'pending',
  title: 'Schulaufgabe 1',
  latexPreamble: '\\usepackage{amsmath}',
  createdAt: new Date().toISOString(),
});

describe('decrypt guard', () => {
  beforeEach(() => {
    vaultIntegrityStore.reset();
  });

  it('refuses to encrypt without a key instead of writing plaintext', async () => {
    await expect(encryptExam(baseExam(), null)).rejects.toBeInstanceOf(MissingSessionKeyError);
    await expect(
      encryptSubmission(
        { id: 's1', examId: 'exam-1', pseudonymHash: 'abc', createdAt: '', totalScore: 7 },
        null
      )
    ).rejects.toBeInstanceOf(MissingSessionKeyError);
    await expect(
      encryptScore({ id: 'sc1', submissionId: 's1', exerciseId: 'e1', score: 3 }, null)
    ).rejects.toBeInstanceOf(MissingSessionKeyError);
  });

  it('marks a record the wrong key cannot open, and reports it', async () => {
    const sealed = await encryptExam(baseExam(), await aesKey(1));
    const opened = await decryptExam(sealed, await aesKey(2));

    expect(isDecryptFailed(opened)).toBe(true);
    expect(opened.title).toBeUndefined();

    let reported = { kinds: [] as string[], count: 0 };
    vaultIntegrityStore.subscribe((s) => (reported = s))();
    expect(reported.count).toBe(1);
    expect(reported.kinds).toContain('exam');
  });

  it('refuses to write back a record that never decrypted', async () => {
    const sealed = await encryptExam(baseExam(), await aesKey(1));
    const opened = await decryptExam(sealed, await aesKey(2));

    // This is the data-loss path: re-sealing `opened` would replace the real
    // title and preamble with undefined.
    await expect(encryptExam(opened, await aesKey(2))).rejects.toBeInstanceOf(DecryptFailedError);
  });

  it('treats a locked read as unwritable too, but does not raise the banner', async () => {
    const sealed = await encryptExam(baseExam(), await aesKey(1));
    const opened = await decryptExam(sealed, null);

    expect(opened.decryptFailed).toBe('locked');
    await expect(encryptExam(opened, await aesKey(1))).rejects.toBeInstanceOf(DecryptFailedError);

    let reported = { kinds: [] as string[], count: 0 };
    vaultIntegrityStore.subscribe((s) => (reported = s))();
    expect(reported.count).toBe(0);
  });

  it('round-trips cleanly with the right key and leaves the record writable', async () => {
    const key = await aesKey(1);
    const opened = await decryptExam(await encryptExam(baseExam(), key), key);

    expect(isDecryptFailed(opened)).toBe(false);
    expect(opened.title).toBe('Schulaufgabe 1');
    expect(opened.latexPreamble).toBe('\\usepackage{amsmath}');
    await expect(encryptExam(opened, key)).resolves.toBeTruthy();
  });

  it('leaves a record with no sealed payload alone', async () => {
    // A legacy plaintext row: nothing to open, so nothing to fail.
    const opened = await decryptExam(baseExam(), null);
    expect(isDecryptFailed(opened)).toBe(false);
    expect(opened.title).toBe('Schulaufgabe 1');
  });

  it('clearDecryptFailed lets a rebuilt record be written again', async () => {
    const sealed = await encryptExam(baseExam(), await aesKey(1));
    const opened = await decryptExam(sealed, await aesKey(2));
    const rebuilt = clearDecryptFailed({ ...opened, title: 'Recovered by hand' });

    await expect(encryptExam(rebuilt, await aesKey(2))).resolves.toBeTruthy();
  });
});
