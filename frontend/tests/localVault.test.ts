import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

function makeStorage() {
  const data: Record<string, string> = {};
  return {
    data,
    api: {
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => { data[k] = v; },
      removeItem: (k: string) => { delete data[k]; },
      clear: () => { for (const k of Object.keys(data)) delete data[k]; },
      length: 0,
      key: () => null,
    },
  };
}

const local = makeStorage();
const session = makeStorage();
globalThis.localStorage = local.api as unknown as Storage;
globalThis.sessionStorage = session.api as unknown as Storage;

// The store reads `window` to decide whether it may touch storage.
(globalThis as any).window = globalThis;
(globalThis as any).BroadcastChannel = undefined;

const { sessionStore, hasLocalVault, hasLegacyLocalVault } = await import('$lib/stores/session');
const { encrypt, decrypt } = await import('$lib/crypto/aesGcm');
const { PBKDF2_ITERATIONS, PBKDF2_ITERATIONS_LEGACY, derivePbkdf2Key } = await import(
  '$lib/crypto/keyDerivation'
);

const PASSPHRASE = 'correct-horse-battery-staple';

describe('local vault passphrase handling', () => {
  beforeEach(() => {
    local.api.clear();
    session.api.clear();
    sessionStore.reset();
  });

  it('refuses to unlock without a passphrase', async () => {
    await expect(sessionStore.unlockLocalSession('')).rejects.toThrow(/passphrase is required/i);
  });

  it('never writes the passphrase to localStorage', async () => {
    await sessionStore.unlockLocalSession(PASSPHRASE);

    const stored = JSON.stringify(local.data);
    expect(stored).not.toContain(PASSPHRASE);
    expect(local.data['bg_anon_pwd']).toBeUndefined();
  });

  it('persists only the non-secret derivation parameters', async () => {
    await sessionStore.unlockLocalSession(PASSPHRASE);

    expect(local.data['bg_anon_salt']).toBeTruthy();
    expect(local.data['bg_anon_nonce']).toBeTruthy();
    expect(Object.keys(local.data).sort()).toEqual(
      ['bg_anon_nonce', 'bg_anon_salt', 'bg_session_mode'].sort()
    );
  });

  it('re-derives the same key from the same passphrase', async () => {
    await sessionStore.unlockLocalSession(PASSPHRASE);
    const firstKey = get(sessionStore).sessionKey!;
    const { ciphertext, iv } = await encrypt(firstKey, new TextEncoder().encode('exam data'));

    sessionStore.reset();
    session.api.clear();

    await sessionStore.unlockLocalSession(PASSPHRASE);
    const secondKey = get(sessionStore).sessionKey!;

    const plain = await decrypt(secondKey, ciphertext, iv);
    expect(new TextDecoder().decode(plain)).toBe('exam data');
  });

  it('does not open the vault with a different passphrase', async () => {
    await sessionStore.unlockLocalSession(PASSPHRASE);
    const goodKey = get(sessionStore).sessionKey!;
    const { ciphertext, iv } = await encrypt(goodKey, new TextEncoder().encode('exam data'));

    sessionStore.reset();
    session.api.clear();

    await sessionStore.unlockLocalSession('a-completely-different-passphrase');
    const wrongKey = get(sessionStore).sessionKey!;

    await expect(decrypt(wrongKey, ciphertext, iv, null)).rejects.toBeDefined();
  });

  it('reports vault presence and legacy state', async () => {
    expect(hasLocalVault()).toBe(false);
    expect(hasLegacyLocalVault()).toBe(false);

    await sessionStore.unlockLocalSession(PASSPHRASE);
    expect(hasLocalVault()).toBe(true);
    expect(hasLegacyLocalVault()).toBe(false);

    local.api.setItem('bg_anon_pwd', 'legacy-generated-password');
    expect(hasLegacyLocalVault()).toBe(true);
  });

  it('clears key material from sessionStorage on lock', async () => {
    await sessionStore.unlockLocalSession(PASSPHRASE);
    expect(session.data['bg_session_key']).toBeTruthy();

    sessionStore.lock();
    expect(session.data['bg_session_key']).toBeUndefined();
    expect(session.data['bg_session_master_key_raw']).toBeUndefined();
    expect(get(sessionStore).sessionKey).toBeNull();
  });
});

describe('PBKDF2 parameters', () => {
  it('uses the OWASP 2024 iteration count by default', () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000);
    expect(PBKDF2_ITERATIONS_LEGACY).toBe(1_000);
  });

  it('derives a different key at the legacy iteration count', async () => {
    const salt = new Uint8Array(16).fill(7);
    const current = await derivePbkdf2Key(PASSPHRASE, salt);
    const legacy = await derivePbkdf2Key(PASSPHRASE, salt, PBKDF2_ITERATIONS_LEGACY);

    expect(Array.from(current.rawKey)).not.toEqual(Array.from(legacy.rawKey));
  });
});
