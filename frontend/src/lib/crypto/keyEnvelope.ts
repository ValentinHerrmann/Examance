/**
 * Key envelope — the wrapped copies of the data-encryption key.
 *
 * The DEK used to be *derived* from the login password, which meant a password
 * reset produced a different key and silently orphaned every vault: the AES-GCM
 * opens failed, the decryptors in `lib/db/dbEncryption.ts` swallow that failure
 * and return the record without its plaintext, and the teacher saw blank titles
 * and blank student names rather than an error.
 *
 * The DEK is now random and independent of any password. Each factor that may
 * recover it — the password, a printable recovery code, a PRF-capable passkey —
 * derives a key-encryption key (KEK) in this browser and wraps its own copy.
 * Changing a password re-wraps the same DEK; nothing is ever re-encrypted.
 *
 * What the server stores is ciphertext, a public salt and public KDF parameters.
 * It never sees a password, a recovery code or a PRF output, so it cannot unwrap
 * anything it holds.
 */

import { decrypt, fromBase64url, toArrayBuffer, toBase64url } from './aesGcm';
import { deriveArgon2Key, derivePbkdf2Key } from './keyDerivation';

/** Bundle format version. Bumped only on a breaking change to the payload shape. */
export const ENVELOPE_VERSION = 1;

/** Argon2id parameters for the password and recovery-code KEKs. */
export const KEK_KDF_PARAMS = { t: 3, m: 65536, p: 4 } as const;

export type EnvelopeKind = 'password' | 'recovery' | 'passkey';

/**
 * What a wrap actually protects.
 *
 * Not just the DEK: `decrypt()` walks primary -> fallback -> legacy, so a real
 * vault can hold records that only open under the superseded PBKDF2 keys. The
 * moment an account is migrated is the only moment all three exist together, so
 * all three are captured here. Wrapping the DEK alone would strand those records
 * the first time the teacher signs in without their password.
 */
export interface KeyBundle {
  v: number;
  dek: string;
  fallback: string | null;
  legacy: string | null;
}

export interface KeyEnvelope {
  id?: string;
  kind: EnvelopeKind;
  credentialIdB64: string | null;
  kdf: 'argon2id' | 'hkdf';
  kdfSalt: Uint8Array;
  kdfParams: Record<string, number>;
  wrappedBundle: Uint8Array;
  wrapIv: Uint8Array;
  invalidatedAt?: string | null;
}

export interface EnvelopeSet {
  keyId: Uint8Array;
  envelopes: KeyEnvelope[];
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** HKDF info strings. Distinct per factor so one KEK can never stand in for another. */
const INFO: Record<EnvelopeKind, string> = {
  password: 'examance-kek-password-v1',
  recovery: 'examance-kek-recovery-v1',
  passkey: 'examance-kek-passkey-v1',
};

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** A fresh 32-byte data-encryption key. */
export function generateDek(): Uint8Array {
  return randomBytes(32);
}

/** A fresh 16-byte identifier for one DEK generation. */
export function generateKeyId(): Uint8Array {
  return randomBytes(16);
}

/**
 * Crockford base32 without I, L, O and U — the characters people misread when
 * copying a code off paper, which is the only way this one is ever transported.
 */
const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RECOVERY_GROUPS = 8;
const RECOVERY_GROUP_LEN = 5;

/**
 * Generate a recovery code carrying ~198 bits of entropy, grouped for reading
 * aloud. Shown once, never stored, and the only factor that always works.
 */
export function generateRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < RECOVERY_GROUPS; g++) {
    const raw = randomBytes(RECOVERY_GROUP_LEN);
    let group = '';
    for (let i = 0; i < RECOVERY_GROUP_LEN; i++) {
      group += RECOVERY_ALPHABET[raw[i] % RECOVERY_ALPHABET.length];
    }
    groups.push(group);
  }
  return groups.join('-');
}

/**
 * Normalize a typed recovery code: strip separators, uppercase, and map the
 * characters the alphabet deliberately excludes onto what the writer meant.
 */
export function normalizeRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V');
}

async function hkdfKek(material: Uint8Array, salt: Uint8Array, kind: EnvelopeKind): Promise<CryptoKey> {
  const hkdfKey = await crypto.subtle.importKey('raw', toArrayBuffer(material), 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      info: encoder.encode(INFO[kind]),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Derive the key-encryption key for a password or recovery-code factor.
 *
 * Argon2id over a *random* per-factor salt. The old scheme derived from
 * SHA-256("blindgrade-user-salt:" + email), which is public and identical for
 * every vault of a given address.
 */
export async function deriveSecretKek(
  secret: string,
  salt: Uint8Array,
  kind: 'password' | 'recovery',
): Promise<CryptoKey> {
  const { rawKey } = await deriveArgon2Key(secret, salt);
  return hkdfKek(rawKey, salt, kind);
}

/**
 * The same key-encryption key, but derived with PBKDF2.
 *
 * Only for *opening* wraps written while Argon2 was unavailable. `deriveKey`
 * used to substitute PBKDF2 on any Argon2 failure without recording that it had
 * — so a wrap can claim `argon2id` and be openable only by this. Nothing writes
 * such a wrap any more; this exists to get the accounts that already have one
 * back to their data.
 */
export async function deriveFallbackSecretKek(
  secret: string,
  salt: Uint8Array,
  kind: 'password' | 'recovery',
): Promise<CryptoKey> {
  const { rawKey } = await derivePbkdf2Key(secret, salt);
  return hkdfKek(rawKey, salt, kind);
}

/**
 * Open a wrap with whichever KDF actually made it.
 *
 * `envelope.kdf` cannot be trusted: the substitution that produced these wraps
 * left the label saying `argon2id` either way. So the recorded KDF is tried
 * first and the other one second, and the caller is told which won — a wrap that
 * only opened under the fallback is repaired rather than left to fail the next
 * time Argon2 loads (or does not).
 */
export async function unwrapWithSecret(
  secret: string,
  envelope: KeyEnvelope,
  teacherId: string,
  keyId: Uint8Array,
  kind: 'password' | 'recovery',
): Promise<{ bundle: UnwrappedBundle; usedFallbackKdf: boolean }> {
  try {
    const kek = await deriveSecretKek(secret, envelope.kdfSalt, kind);
    return { bundle: await unwrapBundle(kek, envelope, teacherId, keyId), usedFallbackKdf: false };
  } catch (primaryErr) {
    const kek = await deriveFallbackSecretKek(secret, envelope.kdfSalt, kind);
    try {
      return { bundle: await unwrapBundle(kek, envelope, teacherId, keyId), usedFallbackKdf: true };
    } catch {
      // Report the first failure: an Argon2-labelled wrap that neither KDF opens
      // is a wrong secret, and that is the answer the caller needs.
      throw primaryErr;
    }
  }
}

/** Derive the key-encryption key from a passkey's PRF output. */
export async function derivePrfKek(prfOutput: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  return hkdfKek(prfOutput, salt, 'passkey');
}

/**
 * Additional authenticated data for a wrap.
 *
 * Binds the ciphertext to the account, the factor and the DEK generation, so a
 * wrap cannot be replayed under a different kind or against a different key
 * generation. It does not defend against a server that substitutes the whole
 * set — see `envelopeFingerprint`.
 */
function wrapAad(teacherId: string, kind: EnvelopeKind, keyId: Uint8Array): Uint8Array {
  return encoder.encode(`${teacherId}|${kind}|${toBase64url(keyId)}|${ENVELOPE_VERSION}`);
}

export function buildBundle(
  dek: Uint8Array,
  fallback: Uint8Array | null,
  legacy: Uint8Array | null,
): KeyBundle {
  return {
    v: ENVELOPE_VERSION,
    dek: toBase64url(dek),
    fallback: fallback ? toBase64url(fallback) : null,
    legacy: legacy ? toBase64url(legacy) : null,
  };
}

export interface UnwrappedBundle {
  dek: Uint8Array;
  fallback: Uint8Array | null;
  legacy: Uint8Array | null;
}

function parseBundle(json: string): UnwrappedBundle {
  const parsed = JSON.parse(json) as KeyBundle;
  if (!parsed || typeof parsed.dek !== 'string') {
    throw new Error('Key bundle is malformed.');
  }
  return {
    dek: fromBase64url(parsed.dek),
    fallback: parsed.fallback ? fromBase64url(parsed.fallback) : null,
    legacy: parsed.legacy ? fromBase64url(parsed.legacy) : null,
  };
}

/** Wrap *bundle* under *kek*, producing the ciphertext the server stores. */
export async function wrapBundle(
  kek: CryptoKey,
  bundle: KeyBundle,
  teacherId: string,
  kind: EnvelopeKind,
  keyId: Uint8Array,
): Promise<{ wrappedBundle: Uint8Array; wrapIv: Uint8Array }> {
  const iv = randomBytes(12);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(wrapAad(teacherId, kind, keyId)),
      },
      kek,
      toArrayBuffer(encoder.encode(JSON.stringify(bundle))),
    ),
  );
  return { wrappedBundle: ct, wrapIv: iv };
}

/**
 * Unwrap one envelope. Throws when *kek* is not the key that wrapped it — GCM
 * authentication is what tells a wrong password apart from a corrupted store,
 * which is the distinction the old derive-everything scheme could not make.
 */
export async function unwrapBundle(
  kek: CryptoKey,
  envelope: KeyEnvelope,
  teacherId: string,
  keyId: Uint8Array,
): Promise<UnwrappedBundle> {
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(envelope.wrapIv),
        additionalData: toArrayBuffer(wrapAad(teacherId, envelope.kind, keyId)),
      },
      kek,
      toArrayBuffer(envelope.wrappedBundle),
    ),
  );
  return parseBundle(decoder.decode(plaintext));
}

/**
 * Fingerprint of an envelope set, pinned locally after the first successful
 * unwrap.
 *
 * A server that serves a substituted set — one whose DEK it knows — would have
 * everything written afterwards readable by it. AAD binding cannot catch that,
 * because the server picks both sides. A pinned fingerprint can: the set only
 * changes when this browser re-wraps it.
 */
export async function envelopeFingerprint(set: EnvelopeSet): Promise<string> {
  const parts = set.envelopes
    .map((e) => `${e.kind}:${e.credentialIdB64 ?? ''}:${toBase64url(e.wrappedBundle)}`)
    .sort();
  const material = encoder.encode(`${toBase64url(set.keyId)}|${parts.join('|')}`);
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(material));
  return toBase64url(new Uint8Array(digest));
}

/**
 * Prove the unwrapped DEK is the one this vault was sealed with.
 *
 * Cheap insurance against adopting a substituted envelope: if the store already
 * holds ciphertext, the recovered key has to open it.
 */
export async function dekOpensSample(
  sessionKey: CryptoKey,
  sampleCt: Uint8Array,
  sampleIv: Uint8Array,
): Promise<boolean> {
  try {
    await decrypt(sessionKey, sampleCt, sampleIv);
    return true;
  } catch {
    return false;
  }
}

/** Round-trip self-check used by the migration path before anything is persisted. */
export async function verifyWrap(
  kek: CryptoKey,
  envelope: KeyEnvelope,
  teacherId: string,
  keyId: Uint8Array,
  expectedDek: Uint8Array,
): Promise<boolean> {
  try {
    const bundle = await unwrapBundle(kek, envelope, teacherId, keyId);
    if (bundle.dek.length !== expectedDek.length) return false;
    let equal = 0;
    for (let i = 0; i < expectedDek.length; i++) {
      equal |= bundle.dek[i] ^ expectedDek[i];
    }
    return equal === 0;
  } catch {
    return false;
  }
}
