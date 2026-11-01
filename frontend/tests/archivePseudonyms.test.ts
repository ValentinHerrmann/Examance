import { beforeAll, describe, expect, it } from 'vitest';
import { importedPseudonym } from '../src/lib/archive/pseudonyms';
import { keyFromRaw, pseudonymBase } from '../src/lib/crypto/pseudonymKey';
import { sessionStore } from '../src/lib/stores/session';
import { hkdfMasterKey } from './helpers/keys';

// Issue #177: keyed values belong to one exam of one account; an import re-keys them into the target exam.
describe('importedPseudonym', () => {
  beforeAll(async () => {
    const aes = await crypto.subtle.importKey('raw', new Uint8Array(32).fill(2), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    await sessionStore.unlock({ masterKey: await hkdfMasterKey(), sessionKey: aes, sessionNonce: new Uint8Array(12) });
  });

  it('re-keys a payload-v4 raw value into the target exam', async () => {
    expect(await importedPseudonym({ pseudonymId: 'raw-1' }, 'exam-new', 2, false)).toEqual({
      pseudonymHmac: await keyFromRaw('exam-new', 'raw-1'),
      pseudonymVersion: 2,
    });
  });

  it('keeps a keyed value back in the same exam of the same account', async () => {
    const keyed = await keyFromRaw('exam-1', 'raw-1');
    const row = { pseudonymHmac: keyed, pseudonymVersion: 2 };
    expect((await importedPseudonym(row, 'exam-1', 2, true)).pseudonymHmac).toBe(keyed);
  });

  it("re-keys another account's keyed value from its archived base", async () => {
    const row = { pseudonymHmac: 'f'.repeat(64), pseudonymVersion: 2, pseudonymBase: await pseudonymBase('raw-1') };
    expect((await importedPseudonym(row, 'exam-2', 2, false)).pseudonymHmac).toBe(await keyFromRaw('exam-2', 'raw-1'));
  });

  it('keeps an opaque value it cannot re-key, so students and submissions still meet', async () => {
    const row = { pseudonymHmac: 'f'.repeat(64), pseudonymVersion: 2 };
    expect(await importedPseudonym(row, 'exam-2', 2, false)).toEqual({ pseudonymHmac: 'f'.repeat(64), pseudonymVersion: 2 });
  });

  it('writes the SHA-256 form into an exam the server still keeps at version 1', async () => {
    expect(await importedPseudonym({ pseudonymHash: 'raw-1' }, 'exam-old', 1, false)).toEqual({
      pseudonymHmac: await pseudonymBase('raw-1'),
      pseudonymVersion: 1,
    });
  });
});
