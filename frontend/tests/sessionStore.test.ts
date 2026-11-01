// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { sessionStore } from '../src/lib/stores/session';
import { uint8ArrayToBase64 } from '../src/lib/crypto/aesGcm';

async function aesKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new Uint8Array(32).fill(3), { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

async function unlockSample(teacherId = 't-1'): Promise<void> {
  const key = await aesKey();
  await sessionStore.unlock({
    masterKey: key,
    masterKeyRaw: new Uint8Array(32).fill(9),
    sessionKey: key,
    legacySessionKey: key,
    legacyMasterKeyRaw: new Uint8Array(32).fill(5),
    sessionNonce: new Uint8Array(12).fill(1),
    teacherId,
  });
}

const RAW_KEY_ENTRIES = [
  'bg_session_master_key_raw',
  'bg_session_key',
  'bg_session_fallback_master_key_raw',
  'bg_session_fallback_key',
  'bg_session_legacy_master_key_raw',
  'bg_session_legacy_key',
];

/** A fresh module instance, as after F5: same sessionStorage and IndexedDB, empty memory. */
async function reloadedStore(): Promise<typeof sessionStore> {
  vi.resetModules();
  return (await import('../src/lib/stores/session')).sessionStore;
}

async function idle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

describe('sessionStore key material', () => {
  beforeEach(async () => {
    sessionStore.lock();
    await idle();
    sessionStorage.clear();
  });

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

  it('keeps no raw key bytes in sessionStorage, only the sealed record (S10 part 2, issue #179)', async () => {
    await unlockSample();
    for (const name of RAW_KEY_ENTRIES) expect(sessionStorage.getItem(name)).toBeNull();
    const sealed = sessionStorage.getItem('bg_session_sealed') ?? '';
    expect(sealed).toMatch(/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
    expect(sealed).not.toContain(uint8ArrayToBase64(new Uint8Array(32).fill(9)));
    expect(sessionStorage.getItem('bg_session_teacher_id')).toBe('t-1');
  });

  it('restores every key, legacy ones included, after a reload (F17)', async () => {
    await unlockSample();
    const reloaded = await reloadedStore();
    expect(await reloaded.restoreFromSessionStorage()).toBe(true);
    const restored = get(reloaded);
    expect(restored.legacySessionKey).not.toBeNull();
    expect(Array.from(restored.legacyMasterKeyRaw ?? [])).toEqual(new Array(32).fill(5));
    expect(restored.teacherId).toBe('t-1');
    reloaded.lock();
  });

  it('signs in again when the wrapping key is gone, and clears the sealed record', async () => {
    await unlockSample();
    const { dropAllTabKeys } = await import('../src/lib/crypto/sessionWrap');
    await dropAllTabKeys();
    const reloaded = await reloadedStore();
    expect(await reloaded.restoreFromSessionStorage()).toBe(false);
    expect(sessionStorage.getItem('bg_session_sealed')).toBeNull();
  });

  it('drops the wrapping key on lock, so the sealed record cannot be opened again', async () => {
    await unlockSample();
    const sealed = sessionStorage.getItem('bg_session_sealed') ?? '';
    const tabId = sessionStorage.getItem('bg_session_tab') ?? '';
    sessionStore.lock();
    await idle();
    expect(sessionStorage.getItem('bg_session_sealed')).toBeNull();
    const { openForTab } = await import('../src/lib/crypto/sessionWrap');
    expect(await openForTab(tabId, sealed)).toBeNull();
  });

  it('gives a duplicated tab its own wrapping key and leaves the original one alone', async () => {
    await unlockSample();
    const originalTab = sessionStorage.getItem('bg_session_tab') ?? '';
    const originalSealed = sessionStorage.getItem('bg_session_sealed') ?? '';
    // The original tab is alive and holds its lock; the copy restores in a new page.
    const held = new Set([`examance-tab:${originalTab}`]);
    const locks = {
      request: async (name: string, _opts: unknown, cb: (lock: object | null) => unknown) => {
        if (held.has(name)) return cb(null);
        held.add(name);
        void cb({ name });
        return undefined;
      },
      query: async () => ({ held: [...held].map((name) => ({ name })), pending: [] }),
    };
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
    try {
      const copy = await reloadedStore();
      expect(await copy.restoreFromSessionStorage()).toBe(true);
      expect(sessionStorage.getItem('bg_session_tab')).not.toBe(originalTab);
      const { openForTab } = await import('../src/lib/crypto/sessionWrap');
      expect(await openForTab(originalTab, originalSealed)).not.toBeNull();
    } finally {
      Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
    }
  });

  it('re-wraps raw entries left by an older build and removes them', async () => {
    const key = await aesKey();
    const raw = uint8ArrayToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
    sessionStorage.setItem('bg_session_key', raw);
    sessionStorage.setItem('bg_session_master_key_raw', uint8ArrayToBase64(new Uint8Array(32).fill(9)));
    sessionStorage.setItem('bg_session_nonce', uint8ArrayToBase64(new Uint8Array(12).fill(1)));
    sessionStorage.setItem('bg_session_mode', 'authenticated');

    const reloaded = await reloadedStore();
    expect(await reloaded.restoreFromSessionStorage()).toBe(true);
    for (const name of RAW_KEY_ENTRIES) expect(sessionStorage.getItem(name)).toBeNull();
    expect(sessionStorage.getItem('bg_session_sealed')).not.toBeNull();
    reloaded.lock();
  });
});
