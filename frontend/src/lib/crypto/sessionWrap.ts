/** Per-tab wrapping key for the session keys kept across reloads (issue #179, docs/dev/session_key_wrap.md): a random non-extractable AES-GCM key in its own IndexedDB, so sessionStorage holds only ciphertext. It stops passive and at-rest reads of sessionStorage; script on the origin can still use the key. */

import { uint8ArrayToBase64, base64ToUint8Array, toArrayBuffer } from '#lib/crypto/aesGcm';

const DB_NAME = 'examance-session-wrap';
const STORE = 'keys';
const LOCK_PREFIX = 'examance-tab:';
/** Matches the idle lock (`hygiene.ts`): an unclaimed key this old belongs to a tab that is gone. */
export const STALE_AFTER_MS = 60 * 60 * 1000;

interface Entry {
  tabId: string;
  key: CryptoKey;
  touchedAt: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** False without IndexedDB or WebCrypto: nothing is persisted then, and a reload asks other tabs or signs in again (fail closed). */
export function wrapAvailable(): boolean {
  return typeof indexedDB !== 'undefined' && typeof crypto !== 'undefined' && !!crypto.subtle;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'tabId' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open the session-wrap database.'));
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = op(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? new Error('Session-wrap transaction failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Session-wrap transaction aborted.'));
  });
}

// Every write goes through one chain, so a drop issued by a lock can never land after the key of a quick re-unlock.
let chain: Promise<unknown> = Promise.resolve();
function serialized<T>(op: () => Promise<T>): Promise<T> {
  const next = chain.then(op, op);
  chain = next.catch(() => undefined);
  return next;
}

async function loadKey(tabId: string): Promise<CryptoKey | null> {
  const entry = (await run('readonly', (s) => s.get(tabId))) as Entry | undefined;
  if (!entry) return null;
  await run('readwrite', (s) => s.put({ ...entry, touchedAt: Date.now() }));
  return entry.key;
}

async function keyFor(tabId: string): Promise<CryptoKey> {
  const existing = await loadKey(tabId);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await run('readwrite', (s) => s.put({ tabId, key, touchedAt: Date.now() } satisfies Entry));
  return key;
}

function aad(tabId: string): ArrayBuffer {
  return toArrayBuffer(encoder.encode(`session-wrap:v1:${tabId}`));
}

/** Seals `plaintext` under this tab's wrapping key (created on first use) as `<iv>.<ciphertext>` in base64. */
export function sealForTab(tabId: string, plaintext: string): Promise<string> {
  return serialized(async () => {
    const key = await keyFor(tabId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv), additionalData: aad(tabId) },
      key,
      toArrayBuffer(encoder.encode(plaintext))
    );
    return `${uint8ArrayToBase64(iv)}.${uint8ArrayToBase64(new Uint8Array(ct))}`;
  });
}

/** Opens a value sealed by `sealForTab`; null when the key is gone (swept, dropped by a lock) or the value does not open. */
export function openForTab(tabId: string, sealed: string): Promise<string | null> {
  return serialized(async () => {
    const [ivB64, ctB64] = sealed.split('.');
    if (!ivB64 || !ctB64) return null;
    const key = await loadKey(tabId);
    if (!key) return null;
    try {
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(base64ToUint8Array(ivB64)), additionalData: aad(tabId) },
        key,
        toArrayBuffer(base64ToUint8Array(ctB64))
      );
      return decoder.decode(plain);
    } catch {
      return null;
    }
  });
}

/** Forgets one tab's wrapping key. */
export function dropTabKey(tabId: string): Promise<void> {
  return serialized(async () => {
    await run('readwrite', (s) => s.delete(tabId));
  });
}

/** Forgets every tab's wrapping key: a lock locks all tabs. */
export function dropAllTabKeys(): Promise<void> {
  return serialized(async () => {
    await run('readwrite', (s) => s.clear());
  });
}

const claimed = new Set<string>();

/** Holds the Web Lock `examance-tab:<id>` for this page's lifetime; false when another live tab holds it (a duplicated tab copied our sessionStorage). Without Web Locks every claim succeeds. */
export function claimTab(tabId: string): Promise<boolean> {
  if (claimed.has(tabId)) return Promise.resolve(true);
  if (typeof navigator === 'undefined' || !navigator.locks) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    navigator.locks
      .request(LOCK_PREFIX + tabId, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(false);
          return undefined;
        }
        claimed.add(tabId);
        resolve(true);
        // Never resolves: the lock is released only when the page goes away.
        return new Promise<void>(() => undefined);
      })
      .catch(() => resolve(true));
  });
}

/** Deletes keys of tabs that are gone: no live tab holds their lock and they were not used within the idle timeout. Skipped without Web Locks, which cannot tell a closed tab from an open one. */
export function sweepStaleTabKeys(now = Date.now()): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.locks) return Promise.resolve();
  return serialized(async () => {
    const snapshot = await navigator.locks.query();
    const live = new Set((snapshot.held ?? []).map((l) => l.name));
    const entries = (await run('readonly', (s) => s.getAll())) as Entry[];
    const stale = entries.filter(
      (e) => !live.has(LOCK_PREFIX + e.tabId) && now - e.touchedAt > STALE_AFTER_MS
    );
    await Promise.all(stale.map((e) => run('readwrite', (s) => s.delete(e.tabId))));
  });
}
