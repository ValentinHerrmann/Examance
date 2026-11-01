/** Keyed per-exam pseudonyms (S3, issue #177, docs/dev/pseudonym_hmac_and_aad.md). `K_exam = HKDF-SHA-256(data key, "examance-pseudonym-v1", examId)`; a key is `HMAC(K_exam, base(raw))`, keyed over the version-1 value so rows the client only knows hashed can be re-keyed. Never re-key a stored version-2 value: compare rows only through `joinKey`. */

import { get } from 'svelte/store';
import { sessionStore } from '#lib/stores/session';
import { MissingSessionKeyError } from '#lib/db/decryptGuard';
import { hmacSha256Hex } from '#lib/crypto/hmac';
import type { PseudonymVersion } from '#lib/db/schema';

const encoder = new TextEncoder();
const SALT = encoder.encode('examance-pseudonym-v1');

/** Per data key (the session's HKDF key object), per exam; dropped with the key on lock, since nothing else holds it. */
const cache = new WeakMap<CryptoKey, Map<string, Promise<CryptoKey>>>();

function examKey(examId: string): Promise<CryptoKey> {
  const master = get(sessionStore).masterKey;
  if (!master) throw new MissingSessionKeyError('pseudonym');
  let perExam = cache.get(master);
  if (!perExam) {
    perExam = new Map();
    cache.set(master, perExam);
  }
  const id = examId.toLowerCase();
  let key = perExam.get(id);
  if (!key) {
    key = crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: encoder.encode(id) },
      master,
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign']
    );
    const map = perExam;
    key.catch(() => map.delete(id));
    perExam.set(id, key);
  }
  return key;
}

/** Lower-case SHA-256 hex; for values that are not pseudonyms (a submission id, a fallback code). */
export async function sha256Hex(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The version-1 form, exactly as older builds sent it: any 64-character value passes through, anything else is hashed. */
export async function pseudonymBase(value: string): Promise<string> {
  return value?.length === 64 ? value : sha256Hex(value ?? '');
}

/** The version-2 key of a fresh raw value (a QR code, a typed id) or of a version-1 value. */
export async function keyFromRaw(examId: string, raw: string): Promise<string> {
  return hmacSha256Hex(await pseudonymBase(raw), await examKey(examId));
}

/** The version-2 key a row stands for, whatever version it was stored at; the one value to compare and join on. */
export async function joinKey(row: {
  examId: string;
  pseudonymHmac: string;
  pseudonymVersion?: PseudonymVersion;
}): Promise<string> {
  return row.pseudonymVersion === 2 ? row.pseudonymHmac : keyFromRaw(row.examId, row.pseudonymHmac);
}

/** `joinKey` of every row, in order, computed in parallel. */
export function joinKeys(rows: readonly Parameters<typeof joinKey>[0][]): Promise<string[]> {
  return Promise.all(rows.map((row) => joinKey(row)));
}

/** The version a server row or exam reports; older servers send none, which means 1. */
export function serverVersion(raw: { pseudonym_version?: number }): PseudonymVersion {
  return raw.pseudonym_version === 2 ? 2 : 1;
}
