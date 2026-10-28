// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { sessionStore } from '../src/lib/stores/session';

async function aesKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new Uint8Array(32).fill(3), { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

describe('sessionStore key material', () => {
  it('wipes its own raw key copies on lock but never the caller vault (S10)', async () => {
    const dek = new Uint8Array(32).fill(9);
    const legacy = new Uint8Array(32).fill(5);
    const key = await aesKey();
    await sessionStore.unlock({
      masterKey: key,
      masterKeyRaw: dek,
      sessionKey: key,
      legacySessionKey: key,
      legacyMasterKeyRaw: legacy,
      sessionNonce: new Uint8Array(12).fill(1),
    });
    const held = get(sessionStore);
    expect(held.masterKeyRaw).not.toBe(dek);

    sessionStore.lock();
    expect(Array.from(held.masterKeyRaw ?? [])).toEqual(new Array(32).fill(0));
    expect(Array.from(held.legacyMasterKeyRaw ?? [])).toEqual(new Array(32).fill(0));
    expect(Array.from(dek)).toEqual(new Array(32).fill(9));
    expect(get(sessionStore).sessionKey).toBeNull();
  });

  it('restores every key, legacy ones included, after a reload (F17)', async () => {
    const key = await aesKey();
    await sessionStore.unlock({
      masterKey: key,
      masterKeyRaw: new Uint8Array(32).fill(9),
      sessionKey: key,
      legacySessionKey: key,
      legacyMasterKeyRaw: new Uint8Array(32).fill(5),
      sessionNonce: new Uint8Array(12).fill(1),
      teacherId: 't-1',
    });
    expect(await sessionStore.restoreFromSessionStorage()).toBe(true);
    const restored = get(sessionStore);
    expect(restored.legacySessionKey).not.toBeNull();
    expect(Array.from(restored.legacyMasterKeyRaw ?? [])).toEqual(new Array(32).fill(5));
    expect(restored.teacherId).toBe('t-1');
    sessionStore.lock();
  });
});
