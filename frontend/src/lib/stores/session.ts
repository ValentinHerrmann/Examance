/**
 * Session store: in-memory key state with tab persistence via sessionStorage + BroadcastChannel.
 * SECURITY: no accessToken field; auth tokens live in httpOnly cookies, never read or stored by JS.
 * masterKey (HKDF) and sessionKey (AES-GCM) sit in tab-isolated volatile sessionStorage, synced across
 * tabs via BroadcastChannel, and are wiped on manual lock, 60-minute inactivity (hygiene.ts), tab close/browser quit.
 */

import { writable, derived, get } from 'svelte/store';
import { uint8ArrayToBase64, base64ToUint8Array, toArrayBuffer } from '#lib/crypto/aesGcm';
import { safeLocalStorage, safeSessionStorage } from '#lib/utils/storage';

export interface SessionState {
  mode: 'hybrid' | 'authenticated' | null;
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
    /** Account id from the sign-in response. The key envelope binds each wrap to the account, not the email, and that binding must survive a reload. Not secret. */
  teacherId: string | null;
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
  teacherId: null,
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
  TEACHER_ID: 'bg_session_teacher_id',
  ROLE: 'bg_session_role',
  MODE: 'bg_session_mode',
  // Written by lib/services/keyEnvelopeService.ts (rememberKeyId), listed here
  // so locking wipes it with everything else. Not secret — a random label for
  // the data-key generation — but it is meaningless once the keys are gone.
  KEY_ID: 'bg_key_id',
} as const;

/**
 * localStorage keys of the discontinued local passphrase vault (issue #47). Never read for keys any
 * more; only to recognise a browser that still holds such a vault and to remove them with it.
 */
const LEGACY_LOCAL_VAULT_KEYS = ['bg_anon_salt', 'bg_anon_nonce', 'bg_anon_pwd'] as const;

/** True when this browser still holds parameters of the discontinued local passphrase vault. */
export function hasLegacyLocalVault(): boolean {
  return LEGACY_LOCAL_VAULT_KEYS.some((k) => safeLocalStorage.getItem(k) !== null);
}

/** Forgets the discontinued local vault's parameters (its data is deleted by the workspace layer). */
export function removeLegacyLocalVault(): void {
  LEGACY_LOCAL_VAULT_KEYS.forEach((k) => safeLocalStorage.removeItem(k));
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
  teacherId?: string | null;
  role?: 'teacher' | 'admin' | null;
  mode: 'hybrid' | 'authenticated';
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
    if (params.teacherId) {
      safeSessionStorage.setItem(SESSION_STORAGE_KEYS.TEACHER_ID, params.teacherId);
    }
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
                // Without it a tab restored this way identified the account by e-mail only, and the
                // workspace owner check (lib/db/workspace.ts) took that for another account.
                teacherId: state.teacherId,
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
      teacherId?: string;
      role?: 'teacher' | 'admin';
      mode?: 'hybrid' | 'authenticated';
    }) {
      const mode = params.mode ?? 'authenticated';
      safeLocalStorage.removeItem('bg_session_locked');
      safeLocalStorage.setItem('bg_session_mode', mode);
      // Older versions stored the address here; nothing reads it, so erase it.
      safeLocalStorage.removeItem('bg_user_email');

      await saveToSessionStorage({
        masterKeyRaw: params.masterKeyRaw,
        sessionKey: params.sessionKey,
        fallbackSessionKey: params.fallbackSessionKey,
        fallbackMasterKeyRaw: params.fallbackMasterKeyRaw,
        legacySessionKey: params.legacySessionKey,
        legacyMasterKeyRaw: params.legacyMasterKeyRaw,
        sessionNonce: params.sessionNonce,
        email: params.email,
        teacherId: params.teacherId,
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
        teacherId: params.teacherId ?? s.teacherId,
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
      // A tab still holding a session of the discontinued local mode must sign in again.
      if ((mode as string) === 'local') {
        clearSessionStorage();
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
        const teacherId = safeSessionStorage.getItem(SESSION_STORAGE_KEYS.TEACHER_ID);
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
          teacherId: teacherId ?? s.teacherId,
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
                teacherId: data.teacherId,
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
                teacherId: data.teacherId ?? s.teacherId,
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

// ---------------------------------------------------------------------------
// Session readiness gate
// ---------------------------------------------------------------------------

/**
 * Resolves once the root layout finished restoring the session. Svelte mounts children before
 * parents, so a route's `onMount` runs before `+layout.svelte` restores keys, asks other tabs or
 * refreshes the token. Every vault-touching route must await this, then still check `isUnlocked`
 * and redirect to `/unlock`.
 */
let resolveSessionReady: (() => void) | null = null;
let sessionReadyPromise: Promise<void> = new Promise<void>((resolve) => {
  resolveSessionReady = resolve;
});

/** Called once by the root layout when restore has settled, successfully or not. */
export function markSessionReady(): void {
  resolveSessionReady?.();
  resolveSessionReady = null;
}

/** Await the root layout's session restore. Safe to call any number of times. */
export function awaitSessionReady(): Promise<void> {
  // On the server there is no layout lifecycle to wait for, and no vault either.
  if (typeof window === 'undefined') return Promise.resolve();
  return sessionReadyPromise;
}

/**
 * Re-arms the gate. Only for tests — production has exactly one layout mount.
 */
export function resetSessionReadyForTests(): void {
  sessionReadyPromise = new Promise<void>((resolve) => {
    resolveSessionReady = resolve;
  });
}
