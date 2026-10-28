/**
 * Session store: in-memory key state, persisted per tab via sessionStorage and synced across tabs via BroadcastChannel.
 * SECURITY: no accessToken field; auth tokens live in httpOnly cookies, never read or stored by JS. masterKey (HKDF) and
 * sessionKey (AES-GCM) are wiped on manual lock, 60-minute inactivity (hygiene.ts), tab close or browser quit.
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

async function exportAesKey(key: CryptoKey | null): Promise<string | undefined> {
  if (!key) return undefined;
  try {
    return uint8ArrayToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
  } catch (err) {
    console.warn('[SessionStore] Failed to export session key:', err);
    return undefined;
  }
}

async function importAesKey(b64: string | undefined): Promise<CryptoKey | null> {
  if (!b64) return null;
  return crypto.subtle.importKey('raw', toArrayBuffer(base64ToUint8Array(b64)), { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

/** Key material as kept per tab and handed to other tabs: one shape, so neither path drops a key (F17). */
type KeyRecord = Partial<Record<keyof typeof SESSION_STORAGE_KEYS, string>>;

async function toKeyRecord(s: SessionState): Promise<KeyRecord> {
  const b64 = (bytes: Uint8Array | null) => (bytes ? uint8ArrayToBase64(bytes) : undefined);
  return {
    MASTER_KEY_RAW: b64(s.masterKeyRaw),
    SESSION_KEY: await exportAesKey(s.sessionKey),
    FALLBACK_MASTER_KEY_RAW: b64(s.fallbackMasterKeyRaw),
    FALLBACK_SESSION_KEY: await exportAesKey(s.fallbackSessionKey),
    LEGACY_MASTER_KEY_RAW: b64(s.legacyMasterKeyRaw),
    LEGACY_SESSION_KEY: await exportAesKey(s.legacySessionKey),
    SESSION_NONCE: b64(s.sessionNonce),
    EMAIL: s.email ?? undefined,
    TEACHER_ID: s.teacherId ?? undefined,
    ROLE: s.role ?? undefined,
    MODE: s.mode ?? undefined,
    KEY_ID: safeSessionStorage.getItem(SESSION_STORAGE_KEYS.KEY_ID) ?? undefined,
  };
}

/** The unlocked state a record describes, or null when it holds no usable session. */
async function fromKeyRecord(r: KeyRecord): Promise<Partial<SessionState> | null> {
  // A session of the discontinued local mode must sign in again.
  if (!r.SESSION_KEY || !r.SESSION_NONCE || !r.MODE || r.MODE === 'local') return null;
  const raw = (b64: string | undefined) => (b64 ? base64ToUint8Array(b64) : null);
  const masterKeyRaw = raw(r.MASTER_KEY_RAW);
  return {
    mode: r.MODE as SessionState['mode'],
    // HKDF keys must be non-extractable per the WebCrypto spec.
    masterKey: masterKeyRaw
      ? await crypto.subtle.importKey('raw', toArrayBuffer(masterKeyRaw), 'HKDF', false, ['deriveKey', 'deriveBits'])
      : null,
    masterKeyRaw,
    sessionKey: await importAesKey(r.SESSION_KEY),
    fallbackSessionKey: await importAesKey(r.FALLBACK_SESSION_KEY),
    fallbackMasterKeyRaw: raw(r.FALLBACK_MASTER_KEY_RAW),
    legacySessionKey: await importAesKey(r.LEGACY_SESSION_KEY),
    legacyMasterKeyRaw: raw(r.LEGACY_MASTER_KEY_RAW),
    sessionNonce: raw(r.SESSION_NONCE),
    lockedAt: null,
    ...(r.EMAIL ? { email: r.EMAIL } : {}),
    ...(r.TEACHER_ID ? { teacherId: r.TEACHER_ID } : {}),
    ...(r.ROLE ? { role: r.ROLE as SessionState['role'] } : {}),
  };
}

function readKeyRecord(): KeyRecord {
  const record: KeyRecord = {};
  for (const [name, key] of Object.entries(SESSION_STORAGE_KEYS)) {
    record[name as keyof KeyRecord] = safeSessionStorage.getItem(key) ?? undefined;
  }
  return record;
}

function writeKeyRecord(record: KeyRecord): void {
  if (!safeSessionStorage.isAvailable()) return;
  try {
    for (const [name, key] of Object.entries(SESSION_STORAGE_KEYS)) {
      const value = record[name as keyof KeyRecord];
      if (value === undefined) safeSessionStorage.removeItem(key);
      else safeSessionStorage.setItem(key, value);
    }
  } catch (err) {
    console.warn('[SessionStore] Could not save keys to sessionStorage:', err);
  }
}

function clearSessionStorage() {
  Object.values(SESSION_STORAGE_KEYS).forEach((k) => safeSessionStorage.removeItem(k));
}

/** Overwrites the raw key bytes before dropping them (S10); CryptoKey objects cannot be wiped. */
function zeroFill(s: SessionState): void {
  for (const bytes of [s.masterKeyRaw, s.fallbackMasterKeyRaw, s.legacyMasterKeyRaw, s.sessionNonce]) {
    bytes?.fill(0);
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
            syncChannel?.postMessage({ type: 'PROVIDE_KEYS', keys: await toKeyRecord(state) });
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

  /** Adopts a record from sessionStorage or another tab; false when it holds no usable session. */
  async function adopt(record: KeyRecord): Promise<boolean> {
    try {
      const keys = await fromKeyRecord(record);
      if (!keys) return false;
      writeKeyRecord(record);
      update((s) => ({ ...s, ...keys }));
      return true;
    } catch (err) {
      console.warn('[SessionStore] Could not import session keys:', err);
      return false;
    }
  }

  function wipe(): void {
    zeroFill(get({ subscribe }));
    set({ ...INITIAL_STATE, lockedAt: Date.now() });
  }

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

      const current = get({ subscribe });
      const next: SessionState = {
        ...current,
        mode,
        masterKey: params.masterKey,
        // Own copies: lock() zero-fills them, and the caller's vault must not be wiped with them.
        masterKeyRaw: params.masterKeyRaw?.slice() ?? null,
        sessionKey: params.sessionKey,
        fallbackSessionKey: params.fallbackSessionKey ?? null,
        fallbackMasterKeyRaw: params.fallbackMasterKeyRaw?.slice() ?? null,
        legacySessionKey: params.legacySessionKey ?? null,
        legacyMasterKeyRaw: params.legacyMasterKeyRaw?.slice() ?? null,
        sessionNonce: params.sessionNonce.slice(),
        lockedAt: null,
        email: params.email ?? current.email,
        teacherId: params.teacherId ?? current.teacherId,
        role: params.role ?? current.role,
      };
      // Storage first: a reload right after unlock must find the keys.
      writeKeyRecord(await toKeyRecord(next));
      set(next);
    },

    /** Restore session keys from tab-isolated sessionStorage across F5 reloads. */
    async restoreFromSessionStorage(): Promise<boolean> {
      if (!safeSessionStorage.isAvailable()) return false;
      const record = readKeyRecord();
      if (await adopt(record)) return true;
      if (record.SESSION_KEY) clearSessionStorage();
      return false;
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
            resolve(await adopt(data.keys ?? {}));
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
      wipe();
    },

    /** Internal reset handler for broadcast lock messages (prevents loop). */
    resetFromBroadcast() {
      wipe();
    },

    setDirty(dirty: boolean) {
      update((s) => ({ ...s, isDirty: dirty }));
    },

    setHybridUser(email: string, role: 'teacher' | 'admin') {
      update((s) => ({ ...s, email, role }));
    },

    reset() {
      clearSessionStorage();
      zeroFill(get({ subscribe }));
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
 * Resolves once the root layout finished restoring the session (keys, other tabs, token refresh). Svelte mounts children
 * before parents, so a route's `onMount` runs earlier: every vault-touching route must await this, then still check
 * `isUnlocked` and redirect to `/unlock`.
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
