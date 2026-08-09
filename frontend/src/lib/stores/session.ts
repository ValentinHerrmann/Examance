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

export interface SessionState {
  mode: 'local' | 'hybrid' | 'authenticated' | null;
  masterKey: CryptoKey | null;            // Argon2id/PBKDF2-derived HKDF CryptoKey
  masterKeyRaw: Uint8Array | null;         // Raw 32-byte master key material
  sessionKey: CryptoKey | null;           // HKDF-derived AES-GCM key from masterKey + nonce
  fallbackSessionKey: CryptoKey | null;   // PBKDF2 alternative key for robust decryption
  fallbackMasterKeyRaw: Uint8Array | null;
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
  SESSION_NONCE: 'bg_session_nonce',
  EMAIL: 'bg_session_email',
  ROLE: 'bg_session_role',
  MODE: 'bg_session_mode',
} as const;

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
  if (typeof sessionStorage === 'undefined') return;
  Object.values(SESSION_STORAGE_KEYS).forEach((k) => sessionStorage.removeItem(k));
}

async function saveToSessionStorage(params: {
  masterKeyRaw?: Uint8Array | null;
  sessionKey: CryptoKey;
  fallbackSessionKey?: CryptoKey | null;
  fallbackMasterKeyRaw?: Uint8Array | null;
  sessionNonce: Uint8Array;
  email?: string | null;
  role?: 'teacher' | 'admin' | null;
  mode: 'local' | 'hybrid' | 'authenticated';
}) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const sessionB64 = await exportSessionKeyToBase64(params.sessionKey);
    const fallbackB64 = await exportSessionKeyToBase64(params.fallbackSessionKey ?? null);

    if (params.masterKeyRaw) {
      sessionStorage.setItem(
        SESSION_STORAGE_KEYS.MASTER_KEY_RAW,
        uint8ArrayToBase64(params.masterKeyRaw)
      );
    }
    if (sessionB64) {
      sessionStorage.setItem(SESSION_STORAGE_KEYS.SESSION_KEY, sessionB64);
    }
    if (params.fallbackMasterKeyRaw) {
      sessionStorage.setItem(
        SESSION_STORAGE_KEYS.FALLBACK_MASTER_KEY_RAW,
        uint8ArrayToBase64(params.fallbackMasterKeyRaw)
      );
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEYS.FALLBACK_MASTER_KEY_RAW);
    }
    if (fallbackB64) {
      sessionStorage.setItem(SESSION_STORAGE_KEYS.FALLBACK_SESSION_KEY, fallbackB64);
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEYS.FALLBACK_SESSION_KEY);
    }
    sessionStorage.setItem(
      SESSION_STORAGE_KEYS.SESSION_NONCE,
      uint8ArrayToBase64(params.sessionNonce)
    );
    sessionStorage.setItem(SESSION_STORAGE_KEYS.MODE, params.mode);
    if (params.email) sessionStorage.setItem(SESSION_STORAGE_KEYS.EMAIL, params.email);
    if (params.role) sessionStorage.setItem(SESSION_STORAGE_KEYS.ROLE, params.role);
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
      sessionNonce: Uint8Array;
      email?: string;
      role?: 'teacher' | 'admin';
      mode?: 'local' | 'hybrid' | 'authenticated';
    }) {
      const mode = params.mode ?? 'authenticated';
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('bg_session_locked');
        localStorage.setItem('bg_session_mode', mode);
        if (params.email) {
          localStorage.setItem('bg_user_email', params.email);
        }
      }

      await saveToSessionStorage({
        masterKeyRaw: params.masterKeyRaw,
        sessionKey: params.sessionKey,
        fallbackSessionKey: params.fallbackSessionKey,
        fallbackMasterKeyRaw: params.fallbackMasterKeyRaw,
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
        sessionNonce: params.sessionNonce,
        lockedAt: null,
        email: params.email ?? s.email,
        role: params.role ?? s.role,
      }));
    },

    /** Restore session keys from tab-isolated sessionStorage across F5 reloads. */
    async restoreFromSessionStorage(): Promise<boolean> {
      if (typeof sessionStorage === 'undefined') return false;

      const masterRawB64 = sessionStorage.getItem(SESSION_STORAGE_KEYS.MASTER_KEY_RAW);
      const sessionB64 = sessionStorage.getItem(SESSION_STORAGE_KEYS.SESSION_KEY);
      const nonceB64 = sessionStorage.getItem(SESSION_STORAGE_KEYS.SESSION_NONCE);
      const mode = sessionStorage.getItem(SESSION_STORAGE_KEYS.MODE) as SessionState['mode'];

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

        const fallbackB64 = sessionStorage.getItem(SESSION_STORAGE_KEYS.FALLBACK_SESSION_KEY);
        const fallbackMasterRawB64 = sessionStorage.getItem(SESSION_STORAGE_KEYS.FALLBACK_MASTER_KEY_RAW);
        let fallbackSessionKey: CryptoKey | null = null;
        let fallbackMasterKeyRaw: Uint8Array | null = null;
        if (fallbackB64) {
          fallbackSessionKey = await importSessionKeyFromBase64(fallbackB64);
        }
        if (fallbackMasterRawB64) {
          fallbackMasterKeyRaw = base64ToUint8Array(fallbackMasterRawB64);
        }

        const email = sessionStorage.getItem(SESSION_STORAGE_KEYS.EMAIL);
        const role = sessionStorage.getItem(SESSION_STORAGE_KEYS.ROLE) as SessionState['role'];

        update((s) => ({
          ...s,
          mode,
          masterKey,
          masterKeyRaw,
          sessionKey,
          fallbackSessionKey,
          fallbackMasterKeyRaw,
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

    /** Automatically unlock an anonymous local session with persistent keys in localStorage. */
    async initAnonymousSession(force = false) {
      if (typeof localStorage === 'undefined') return;

      if (!force && localStorage.getItem('bg_session_locked') === 'true') {
        return;
      }

      let pwd = localStorage.getItem('bg_anon_pwd');
      let saltB64 = localStorage.getItem('bg_anon_salt');
      let nonceB64 = localStorage.getItem('bg_anon_nonce');
      let salt: Uint8Array;
      let sessionNonce: Uint8Array;

      if (!pwd || !saltB64 || !nonceB64) {
        pwd = crypto.randomUUID() + '-' + crypto.randomUUID();
        salt = generateSalt();
        sessionNonce = generateSessionNonce();
        localStorage.setItem('bg_anon_pwd', pwd);
        localStorage.setItem('bg_anon_salt', btoa(String.fromCharCode(...salt)));
        localStorage.setItem('bg_anon_nonce', btoa(String.fromCharCode(...sessionNonce)));
      } else {
        salt = new Uint8Array(atob(saltB64).split('').map((c) => c.charCodeAt(0)));
        sessionNonce = new Uint8Array(atob(nonceB64).split('').map((c) => c.charCodeAt(0)));
      }

      const { masterKey, rawMasterKey, fallbackMasterKey, rawFallbackMasterKey } = await deriveKeyWithFallback(pwd, salt);
      const sessionKey = await deriveSessionKey(masterKey, sessionNonce);
      const fallbackSessionKey = fallbackMasterKey
        ? await deriveSessionKey(fallbackMasterKey, sessionNonce)
        : null;

      localStorage.removeItem('bg_session_locked');
      localStorage.setItem('bg_session_mode', 'local');

      await saveToSessionStorage({
        masterKeyRaw: rawMasterKey,
        sessionKey,
        fallbackSessionKey,
        fallbackMasterKeyRaw: rawFallbackMasterKey,
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
        sessionNonce,
        lockedAt: null,
        email: null,
        role: null,
      }));
    },

    /** Wipe all key material and lock UI across all tabs. */
    lock() {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bg_session_locked', 'true');
      }
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
