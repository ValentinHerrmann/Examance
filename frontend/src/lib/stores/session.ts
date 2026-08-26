/**
 * Session store — manages in-memory key state and tab persistence via sessionStorage + BroadcastChannel.
 *
 * SECURITY: No accessToken field. Auth tokens live in httpOnly cookies managed
 * by the browser — JavaScript never reads or stores them.
 *
 * masterKey (HKDF CryptoKey) and sessionKey (AES-GCM CryptoKey) are stored in tab-isolated
 * volatile sessionStorage and synced across tabs via BroadcastChannel.
 * They are wiped from this store on:
 *   - Manual lock
 *   - 60-minute inactivity timeout (see hygiene.ts)
 *   - Tab close / browser quit
 */

import { writable, derived, get } from 'svelte/store';
import { deriveKeyWithFallback, generateSalt } from '$lib/crypto/keyDerivation';
import { deriveSessionKey, generateSessionNonce } from '$lib/crypto/sessionKey';
import { uint8ArrayToBase64, base64ToUint8Array, toArrayBuffer } from '$lib/crypto/aesGcm';
import { safeLocalStorage, safeSessionStorage } from '$lib/utils/storage';

export interface SessionState {
  mode: 'local' | 'hybrid' | 'authenticated' | null;
  masterKey: CryptoKey | null;            // Argon2id/PBKDF2-derived HKDF CryptoKey
  masterKeyRaw: Uint8Array | null;         // Raw 32-byte master key material
  sessionKey: CryptoKey | null;           // HKDF-derived AES-GCM key from masterKey + nonce
  fallbackSessionKey: CryptoKey | null;   // PBKDF2 alternative key for robust decryption
  fallbackMasterKeyRaw: Uint8Array | null;
  legacySessionKey: CryptoKey | null;     // PBKDF2 @ old iteration count — DECRYPT ONLY
  legacyMasterKeyRaw: Uint8Array | null;
  sessionNonce: Uint8Array | null;
  lockedAt: number | null;                // Unix ms
  isDirty: boolean;                       // Unsaved IDB changes
  email: string | null;                   // From server login response
  role: 'teacher' | 'admin' | null;
}

const INITIAL_STATE: SessionState = {
  mode: null,
  masterKey: null,
  masterKeyRaw: null,
  sessionKey: null,
  fallbackSessionKey: null,
  fallbackMasterKeyRaw: null,
  legacySessionKey: null,
  legacyMasterKeyRaw: null,
  sessionNonce: null,
  lockedAt: null,
  isDirty: false,
  email: null,
  role: null,
};

const SESSION_STORAGE_KEYS = {
  MASTER_KEY_RAW: 'bg_session_master_key_raw',
  SESSION_KEY: 'bg_session_key',
  FALLBACK_MASTER_KEY_RAW: 'bg_session_fallback_master_key_raw',
  FALLBACK_SESSION_KEY: 'bg_session_fallback_key',
  LEGACY_MASTER_KEY_RAW: 'bg_session_legacy_master_key_raw',
  LEGACY_SESSION_KEY: 'bg_session_legacy_key',
  SESSION_NONCE: 'bg_session_nonce',
  EMAIL: 'bg_session_email',
  ROLE: 'bg_session_role',
  MODE: 'bg_session_mode',
  // Written by lib/services/keyEnvelopeService.ts (rememberKeyId), listed here
  // so locking wipes it with everything else. Not secret — a random label for
  // the data-key generation — but it is meaningless once the keys are gone.
  KEY_ID: 'bg_key_id',
} as const;

/**
 * localStorage keys for the local-only vault.
 *
 * SALT and NONCE are not secret — they are derivation parameters that must
 * survive across sessions. LEGACY_PASSWORD is the pre-passphrase design: a
 * random password kept in cleartext beside the data it protected. It is only
 * ever read, to migrate such a vault, and is deleted once that succeeds.
 */
const LOCAL_VAULT_KEYS = {
  SALT: 'bg_anon_salt',
  NONCE: 'bg_anon_nonce',
  LEGACY_PASSWORD: 'bg_anon_pwd',
} as const;

/** True when a local vault has been initialised on this device. */
export function hasLocalVault(): boolean {
  return safeLocalStorage.getItem(LOCAL_VAULT_KEYS.SALT) !== null;
}

/** True when this device still holds a vault keyed by the old stored password. */
export function hasLegacyLocalVault(): boolean {
  return safeLocalStorage.getItem(LOCAL_VAULT_KEYS.LEGACY_PASSWORD) !== null;
}

function readOrCreateLocalVaultParams(): { salt: Uint8Array; sessionNonce: Uint8Array } {
  const saltB64 = safeLocalStorage.getItem(LOCAL_VAULT_KEYS.SALT);
  const nonceB64 = safeLocalStorage.getItem(LOCAL_VAULT_KEYS.NONCE);

  if (saltB64 && nonceB64) {
    return {
      salt: base64ToUint8Array(saltB64),
      sessionNonce: base64ToUint8Array(nonceB64),
    };
  }

  const salt = generateSalt();
  const sessionNonce = generateSessionNonce();
  safeLocalStorage.setItem(LOCAL_VAULT_KEYS.SALT, uint8ArrayToBase64(salt));
  safeLocalStorage.setItem(LOCAL_VAULT_KEYS.NONCE, uint8ArrayToBase64(sessionNonce));
  return { salt, sessionNonce };
}

async function exportSessionKeyToBase64(key: CryptoKey | null): Promise<string | null> {
  if (!key) return null;
  try {
    const raw = await crypto.subtle.exportKey('raw', key);
    return uint8ArrayToBase64(new Uint8Array(raw));
  } catch (err) {
    console.warn('[SessionStore] Failed to export session key:', err);
    return null;
  }
}

async function importMasterKeyFromRawBytes(bytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(bytes),
    'HKDF',
    false, // HKDF keys must have extractable=false per WebCrypto spec
    ['deriveKey', 'deriveBits']
  );
}

async function importSessionKeyFromBase64(b64: string): Promise<CryptoKey> {
  const bytes = base64ToUint8Array(b64);
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(bytes),
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

function clearSessionStorage() {
  Object.values(SESSION_STORAGE_KEYS).forEach((k) => safeSessionStorage.removeItem(k));
}

async function saveToSessionStorage(params: {
  masterKeyRaw?: Uint8Array | null;
  sessionKey: CryptoKey;
  fallbackSessionKey?: CryptoKey | null;
  fallbackMasterKeyRaw?: Uint8Array | null;
  legacySessionKey?: CryptoKey | null;
  legacyMasterKeyRaw?: Uint8Array | null;
  sessionNonce: Uint8Array;
  email?: string | null;
  role?: 'teacher' | 'admin' | null;
  mode: 'local' | 'hybrid' | 'authenticated';
}) {
  if (!safeSessionStorage.isAvailable()) return;
  try {
    const sessionB64 = await exportSessionKeyToBase64(params.sessionKey);
    const fallbackB64 = await exportSessionKeyToBase64(params.fallbackSessionKey ?? null);
    const legacyB64 = await exportSessionKeyToBase64(params.legacySessionKey ?? null);

    if (params.masterKeyRaw) {
      safeSessionStorage.setItem(
        SESSION_STORAGE_KEYS.MASTER_KEY_RAW,
        uint8ArrayToBase64(params.masterKeyRaw)
      );
    }
    if (sessionB64) {
      safeSessionStorage.setItem(SESSION_STORAGE_KEYS.SESSION_KEY, sessionB64);
    }
    if (params.fallbackMasterKeyRaw) {
      safeSessionStorage.setItem(
        SESSION_STORAGE_KEYS.FALLBACK_MASTER_KEY_RAW,
        uint8ArrayToBase64(params.fallbackMasterKeyRaw)
      );
    } else {
      safeSessionStorage.removeItem(SESSION_STORAGE_KEYS.FALLBACK_MASTER_KEY_RAW);
    }
    if (fallbackB64) {
      safeSessionStorage.setItem(SESSION_STORAGE_KEYS.FALLBACK_SESSION_KEY, fallbackB64);
    } else {
      safeSessionStorage.removeItem(SESSION_STORAGE_KEYS.FALLBACK_SESSION_KEY);
    }
    if (params.legacyMasterKeyRaw) {
      safeSessionStorage.setItem(
        SESSION_STORAGE_KEYS.LEGACY_MASTER_KEY_RAW,
        uint8ArrayToBase64(params.legacyMasterKeyRaw)
      );
    } else {
      safeSessionStorage.removeItem(SESSION_STORAGE_KEYS.LEGACY_MASTER_KEY_RAW);
    }
    if (legacyB64) {
      safeSessionStorage.setItem(SESSION_STORAGE_KEYS.LEGACY_SESSION_KEY, legacyB64);
    } else {
      safeSessionStorage.removeItem(SESSION_STORAGE_KEYS.LEGACY_SESSION_KEY);
    }
    safeSessionStorage.setItem(
      SESSION_STORAGE_KEYS.SESSION_NONCE,
      uint8ArrayToBase64(params.sessionNonce)
    );
    safeSessionStorage.setItem(SESSION_STORAGE_KEYS.MODE, params.mode);
    if (params.email) safeSessionStorage.setItem(SESSION_STORAGE_KEYS.EMAIL, params.email);
    if (params.role) safeSessionStorage.setItem(SESSION_STORAGE_KEYS.ROLE, params.role);
  } catch (err) {
    console.warn('[SessionStore] Could not save keys to sessionStorage:', err);
  }
}

let syncChannel: BroadcastChannel | null = null;

function initBroadcastChannel(
  store: { resetFromBroadcast: () => void },
  getStoreState: () => SessionState
) {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!syncChannel) {
    try {
      syncChannel = new BroadcastChannel('bg_session_sync');
      syncChannel.onmessage = async (event) => {
        const data = event.data;
        if (!data || typeof data !== 'object') return;

        if (data.type === 'REQUEST_KEYS') {
          const state = getStoreState();
          if (state.sessionKey && state.sessionNonce && state.mode) {
            const sessionB64 = await exportSessionKeyToBase64(state.sessionKey);
            const fallbackB64 = await exportSessionKeyToBase64(state.fallbackSessionKey);
            const masterRawB64 = state.masterKeyRaw ? uint8ArrayToBase64(state.masterKeyRaw) : null;
            const fallbackMasterRawB64 = state.fallbackMasterKeyRaw
              ? uint8ArrayToBase64(state.fallbackMasterKeyRaw)
              : null;

            if (sessionB64) {
              syncChannel?.postMessage({
                type: 'PROVIDE_KEYS',
                masterRawB64,
                sessionB64,
                fallbackB64,
                fallbackMasterRawB64,
                sessionNonceB64: uint8ArrayToBase64(state.sessionNonce),
                mode: state.mode,
                email: state.email,
                role: state.role,
              });
            }
          }
        } else if (data.type === 'SESSION_LOCKED') {
          clearSessionStorage();
          store.resetFromBroadcast();
        }
      };
    } catch {
      syncChannel = null;
    }
  }
  return syncChannel;
}

function createSessionStore() {
  const { subscribe, set, update } = writable<SessionState>(INITIAL_STATE);

  const store = {
    subscribe,

    /** Unlock with derived keys after password entry and save to volatile sessionStorage. */
    async unlock(params: {
      masterKey: CryptoKey;
      masterKeyRaw?: Uint8Array | null;
      sessionKey: CryptoKey;
      fallbackSessionKey?: CryptoKey | null;
      fallbackMasterKeyRaw?: Uint8Array | null;
      legacySessionKey?: CryptoKey | null;
      legacyMasterKeyRaw?: Uint8Array | null;
      sessionNonce: Uint8Array;
      email?: string;
      role?: 'teacher' | 'admin';
      mode?: 'local' | 'hybrid' | 'authenticated';
    }) {
      const mode = params.mode ?? 'authenticated';
      safeLocalStorage.removeItem('bg_session_locked');
      safeLocalStorage.setItem('bg_session_mode', mode);
      if (params.email) {
        safeLocalStorage.setItem('bg_user_email', params.email);
      }

      await saveToSessionStorage({
        masterKeyRaw: params.masterKeyRaw,
        sessionKey: params.sessionKey,
        fallbackSessionKey: params.fallbackSessionKey,
        fallbackMasterKeyRaw: params.fallbackMasterKeyRaw,
        legacySessionKey: params.legacySessionKey,
        legacyMasterKeyRaw: params.legacyMasterKeyRaw,
        sessionNonce: params.sessionNonce,
        email: params.email,
        role: params.role,
        mode,
      });

      update((s) => ({
        ...s,
        mode,
        masterKey: params.masterKey,
        masterKeyRaw: params.masterKeyRaw ?? null,
        sessionKey: params.sessionKey,
        fallbackSessionKey: params.fallbackSessionKey ?? null,
        fallbackMasterKeyRaw: params.fallbackMasterKeyRaw ?? null,
        legacySessionKey: params.legacySessionKey ?? null,
        legacyMasterKeyRaw: params.legacyMasterKeyRaw ?? null,
        sessionNonce: params.sessionNonce,
        lockedAt: null,
        email: params.email ?? s.email,
        role: params.role ?? s.role,
      }));
    },

    /** Restore session keys from tab-isolated sessionStorage across F5 reloads. */
    async restoreFromSessionStorage(): Promise<boolean> {
      if (!safeSessionStorage.isAvailable()) return false;

      const masterRawB64 = safeSessionStorage.getItem(SESSION_STORAGE_KEYS.MASTER_KEY_RAW);
      const sessionB64 = safeSessionStorage.getItem(SESSION_STORAGE_KEYS.SESSION_KEY);
      const nonceB64 = safeSessionStorage.getItem(SESSION_STORAGE_KEYS.SESSION_NONCE);
      const mode = safeSessionStorage.getItem(SESSION_STORAGE_KEYS.MODE) as SessionState['mode'];

      if (!sessionB64 || !nonceB64 || !mode) {
        return false;
      }

      try {
        const sessionKey = await importSessionKeyFromBase64(sessionB64);
        const sessionNonce = base64ToUint8Array(nonceB64);

        let masterKey: CryptoKey | null = null;
        let masterKeyRaw: Uint8Array | null = null;
        if (masterRawB64) {
          masterKeyRaw = base64ToUint8Array(masterRawB64);
          masterKey = await importMasterKeyFromRawBytes(masterKeyRaw);
        }

        const fallbackB64 = safeSessionStorage.getItem(SESSION_STORAGE_KEYS.FALLBACK_SESSION_KEY);
        const fallbackMasterRawB64 = safeSessionStorage.getItem(SESSION_STORAGE_KEYS.FALLBACK_MASTER_KEY_RAW);
        let fallbackSessionKey: CryptoKey | null = null;
        let fallbackMasterKeyRaw: Uint8Array | null = null;
        if (fallbackB64) {
          fallbackSessionKey = await importSessionKeyFromBase64(fallbackB64);
        }
        if (fallbackMasterRawB64) {
          fallbackMasterKeyRaw = base64ToUint8Array(fallbackMasterRawB64);
        }

        const legacyB64 = safeSessionStorage.getItem(SESSION_STORAGE_KEYS.LEGACY_SESSION_KEY);
        const legacyMasterRawB64 = safeSessionStorage.getItem(SESSION_STORAGE_KEYS.LEGACY_MASTER_KEY_RAW);
        let legacySessionKey: CryptoKey | null = null;
        let legacyMasterKeyRaw: Uint8Array | null = null;
        if (legacyB64) {
          legacySessionKey = await importSessionKeyFromBase64(legacyB64);
        }
        if (legacyMasterRawB64) {
          legacyMasterKeyRaw = base64ToUint8Array(legacyMasterRawB64);
        }

        const email = safeSessionStorage.getItem(SESSION_STORAGE_KEYS.EMAIL);
        const role = safeSessionStorage.getItem(SESSION_STORAGE_KEYS.ROLE) as SessionState['role'];

        update((s) => ({
          ...s,
          mode,
          masterKey,
          masterKeyRaw,
          sessionKey,
          fallbackSessionKey,
          fallbackMasterKeyRaw,
          legacySessionKey,
          legacyMasterKeyRaw,
          sessionNonce,
          lockedAt: null,
          email: email ?? s.email,
          role: role ?? s.role,
        }));

        return true;
      } catch (err) {
        console.warn('[SessionStore] Could not restore keys from sessionStorage:', err);
        clearSessionStorage();
        return false;
      }
    },

    /** Request keys from another unlocked tab via BroadcastChannel. */
    async requestKeysFromOtherTabs(timeoutMs = 300): Promise<boolean> {
      if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
        return false;
      }

      const ch = initBroadcastChannel(store, () => get(sessionStore));
      if (!ch) return false;

      return new Promise<boolean>((resolve) => {
        // `handler` closes over `timer` and the timeout callback closes over
        // `handler`, so the declaration cannot be merged with its assignment.
        // eslint-disable-next-line prefer-const
        let timer: ReturnType<typeof setTimeout>;

        const handler = async (event: MessageEvent) => {
          const data = event.data;
          if (data && typeof data === 'object' && data.type === 'PROVIDE_KEYS') {
            clearTimeout(timer);
            ch.removeEventListener('message', handler);
            try {
              const sessionKey = await importSessionKeyFromBase64(data.sessionB64);
              const sessionNonce = base64ToUint8Array(data.sessionNonceB64);
              let masterKey: CryptoKey | null = null;
              let masterKeyRaw: Uint8Array | null = null;
              if (data.masterRawB64) {
                masterKeyRaw = base64ToUint8Array(data.masterRawB64);
                masterKey = await importMasterKeyFromRawBytes(masterKeyRaw);
              }

              let fallbackSessionKey: CryptoKey | null = null;
              let fallbackMasterKeyRaw: Uint8Array | null = null;
              if (data.fallbackB64) {
                fallbackSessionKey = await importSessionKeyFromBase64(data.fallbackB64);
              }
              if (data.fallbackMasterRawB64) {
                fallbackMasterKeyRaw = base64ToUint8Array(data.fallbackMasterRawB64);
              }

              await saveToSessionStorage({
                masterKeyRaw,
                sessionKey,
                fallbackSessionKey,
                fallbackMasterKeyRaw,
                sessionNonce,
                email: data.email,
                role: data.role,
                mode: data.mode,
              });

              update((s) => ({
                ...s,
                mode: data.mode,
                masterKey,
                masterKeyRaw,
                sessionKey,
                fallbackSessionKey,
                fallbackMasterKeyRaw,
                sessionNonce,
                lockedAt: null,
                email: data.email ?? s.email,
                role: data.role ?? s.role,
              }));

              resolve(true);
            } catch (err) {
              console.warn('[SessionStore] Key import from BroadcastChannel failed:', err);
              resolve(false);
            }
          }
        };

        ch.addEventListener('message', handler);
        ch.postMessage({ type: 'REQUEST_KEYS' });

        timer = setTimeout(() => {
          ch.removeEventListener('message', handler);
          resolve(false);
        }, timeoutMs);
      });
    },

    /**
     * Unlock the local-only workspace from a user-supplied passphrase.
     *
     * The passphrase is never persisted. Only the salt and the session nonce
     * are kept in localStorage; neither is secret, and both are required to
     * re-derive the same keys on the next unlock.
     *
     * Earlier builds generated a random password and stored it in localStorage
     * next to the encrypted IndexedDB it protected, which meant encryption at
     * rest offered no protection against anyone holding the browser profile.
     * A vault created that way is detected by `hasLegacyLocalVault()` and
     * migrated by `migrateLegacyLocalVault()`.
     */
    async unlockLocalSession(passphrase: string) {
      if (!passphrase) {
        throw new Error('A passphrase is required to unlock the local workspace.');
      }

      const { salt, sessionNonce } = readOrCreateLocalVaultParams();
      const {
        masterKey,
        rawMasterKey,
        fallbackMasterKey,
        rawFallbackMasterKey,
        legacyMasterKey,
        rawLegacyMasterKey,
      } = await deriveKeyWithFallback(passphrase, salt);

      const sessionKey = await deriveSessionKey(masterKey, sessionNonce);
      const fallbackSessionKey = fallbackMasterKey
        ? await deriveSessionKey(fallbackMasterKey, sessionNonce)
        : null;
      const legacySessionKey = legacyMasterKey
        ? await deriveSessionKey(legacyMasterKey, sessionNonce)
        : null;

      safeLocalStorage.removeItem('bg_session_locked');
      safeLocalStorage.setItem('bg_session_mode', 'local');

      await saveToSessionStorage({
        masterKeyRaw: rawMasterKey,
        sessionKey,
        fallbackSessionKey,
        fallbackMasterKeyRaw: rawFallbackMasterKey,
        legacySessionKey,
        legacyMasterKeyRaw: rawLegacyMasterKey,
        sessionNonce,
        mode: 'local',
      });

      update((s) => ({
        ...s,
        mode: 'local',
        masterKey,
        masterKeyRaw: rawMasterKey,
        sessionKey,
        fallbackSessionKey,
        fallbackMasterKeyRaw: rawFallbackMasterKey,
        legacySessionKey,
        legacyMasterKeyRaw: rawLegacyMasterKey,
        sessionNonce,
        lockedAt: null,
        email: null,
        role: null,
      }));
    },

    /**
     * Migrate a vault created by the old "password in localStorage" design.
     *
     * Re-encrypts every record from the generated password's key to a key
     * derived from *newPassphrase*, then deletes the stored password. On any
     * failure nothing is deleted and the old password still opens the vault,
     * so the migration is safe to retry.
     */
    async migrateLegacyLocalVault(newPassphrase: string) {
      if (!newPassphrase) {
        throw new Error('A passphrase is required to migrate the local workspace.');
      }
      if (!safeLocalStorage.isAvailable()) {
        throw new Error('Local storage is unavailable.');
      }

      const legacyPassword = safeLocalStorage.getItem(LOCAL_VAULT_KEYS.LEGACY_PASSWORD);
      if (!legacyPassword) {
        throw new Error('No legacy local workspace to migrate.');
      }

      const { salt: oldSalt, sessionNonce: oldNonce } = readOrCreateLocalVaultParams();

      // Old key: whatever the previous build would have derived.
      const oldDerived = await deriveKeyWithFallback(legacyPassword, oldSalt);
      const oldSessionKey = await deriveSessionKey(oldDerived.masterKey, oldNonce);

      // New key: fresh salt and nonce, so the new vault shares no derivation
      // parameters with the compromised one.
      const newSalt = generateSalt();
      const newNonce = generateSessionNonce();
      const newDerived = await deriveKeyWithFallback(newPassphrase, newSalt);
      const newSessionKey = await deriveSessionKey(newDerived.masterKey, newNonce);

      const { rekeyDatabase } = await import('$lib/db/rekey');
      await rekeyDatabase(oldSessionKey, newSessionKey);

      // Only now is the cleartext password removed and the parameters swapped.
      safeLocalStorage.setItem(LOCAL_VAULT_KEYS.SALT, uint8ArrayToBase64(newSalt));
      safeLocalStorage.setItem(LOCAL_VAULT_KEYS.NONCE, uint8ArrayToBase64(newNonce));
      safeLocalStorage.removeItem(LOCAL_VAULT_KEYS.LEGACY_PASSWORD);

      const fallbackSessionKey = newDerived.fallbackMasterKey
        ? await deriveSessionKey(newDerived.fallbackMasterKey, newNonce)
        : null;

      safeLocalStorage.removeItem('bg_session_locked');
      safeLocalStorage.setItem('bg_session_mode', 'local');

      await saveToSessionStorage({
        masterKeyRaw: newDerived.rawMasterKey,
        sessionKey: newSessionKey,
        fallbackSessionKey,
        fallbackMasterKeyRaw: newDerived.rawFallbackMasterKey,
        sessionNonce: newNonce,
        mode: 'local',
      });

      update((s) => ({
        ...s,
        mode: 'local',
        masterKey: newDerived.masterKey,
        masterKeyRaw: newDerived.rawMasterKey,
        sessionKey: newSessionKey,
        fallbackSessionKey,
        fallbackMasterKeyRaw: newDerived.rawFallbackMasterKey,
        legacySessionKey: null,
        legacyMasterKeyRaw: null,
        sessionNonce: newNonce,
        lockedAt: null,
        email: null,
        role: null,
      }));
    },

    /** Wipe all key material and lock UI across all tabs. */
    lock() {
      safeLocalStorage.setItem('bg_session_locked', 'true');
      clearSessionStorage();

      if (syncChannel) {
        try {
          syncChannel.postMessage({ type: 'SESSION_LOCKED' });
        } catch {
          // Ignore
        }
      }

      set({
        ...INITIAL_STATE,
        lockedAt: Date.now(),
      });
    },

    /** Internal reset handler for broadcast lock messages (prevents loop). */
    resetFromBroadcast() {
      set({
        ...INITIAL_STATE,
        lockedAt: Date.now(),
      });
    },

    setDirty(dirty: boolean) {
      update((s) => ({ ...s, isDirty: dirty }));
    },

    setHybridUser(email: string, role: 'teacher' | 'admin') {
      update((s) => ({ ...s, email, role }));
    },

    reset() {
      clearSessionStorage();
      set(INITIAL_STATE);
    },
  };

  // Enable BroadcastChannel listening on store creation
  if (typeof window !== 'undefined') {
    initBroadcastChannel(store, () => get(store));
  }

  return store;
}

export const sessionStore = createSessionStore();

/** True when the session has active crypto keys. */
export const isUnlocked = derived(
  sessionStore,
  ($s) => $s.sessionKey !== null
);

/** True when user is authenticated with the server (Hybrid Mode). */
export const isAuthenticated = derived(
  sessionStore,
  ($s) => $s.email !== null
);
