/**
 * Key derivation — Argon2id master key from password + salt.
 *
 * Uses argon2-browser WASM. The derived key is a non-extractable HKDF CryptoKey.
 * Per WebCrypto specification, HKDF keys MUST have extractable=false.
 *
 * NOTE: the WASM binary is NOT integrity-verified today. `fetchAndVerifyWasm()`
 * in ./sri.ts implements the check, but nothing is vendored in static/wasm/ and
 * the manifest carries placeholder hashes, so it has no call site here. See
 * static/sri-manifest.json ("enforced": false) for what turning it on requires.
 */

import { toArrayBuffer } from './aesGcm';

export const ArgonType = {
  Argon2d: 0,
  Argon2i: 1,
  Argon2id: 2,
};

async function getArgon2(): Promise<any> {
  if (typeof window !== 'undefined' && (window as any).argon2) {
    return (window as any).argon2;
  }
  if (typeof self !== 'undefined' && (self as any).argon2) {
    return (self as any).argon2;
  }
  try {
    // @ts-ignore
    const argon2Module = await import('argon2-browser/dist/argon2-bundled.min.js');
    const mod: any = (argon2Module as any).default || argon2Module;
    if (mod && typeof mod.hash === 'function') {
      return mod;
    }
    if (typeof window !== 'undefined' && (window as any).argon2) {
      return (window as any).argon2;
    }
  } catch {
    // Try main package export as secondary fallback
  }
  try {
    // @ts-ignore
    const argon2Module = await import('argon2-browser');
    const mod: any = (argon2Module as any).default || argon2Module;
    if (mod && typeof mod.hash === 'function') {
      return mod;
    }
  } catch {
    // Ignore resolution errors
  }
  throw new Error('Argon2 library could not be resolved');
}

/** 16-byte random salt for Argon2id key derivation. */
export function generateSalt(): Uint8Array {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return salt;
}

/**
 * Derive a deterministic 16-byte salt from user email.
 */
export async function getUserSalt(email: string): Promise<Uint8Array> {
  const normalized = email.trim().toLowerCase();
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode('blindgrade-user-salt:' + normalized)
  );
  return new Uint8Array(digest).slice(0, 16);
}

/**
 * Derive a deterministic 12-byte session nonce from user email.
 */
export async function getUserSessionNonce(email: string): Promise<Uint8Array> {
  const normalized = email.trim().toLowerCase();
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode('blindgrade-user-nonce:' + normalized)
  );
  return new Uint8Array(digest).slice(0, 12);
}

/**
 * OWASP 2024 minimum for PBKDF2-HMAC-SHA-256.
 *
 * This is not merely a fallback: `deriveKeyWithFallback` derives the PBKDF2 key
 * on every unlock and stores it alongside the Argon2id key, and `decrypt()`
 * transparently retries with it — so its cost is the effective strength of the
 * whole scheme, not a rarely-taken branch.
 */
export const PBKDF2_ITERATIONS = 600_000;

/**
 * Superseded parameter, kept for decrypting vaults written before the increase.
 * Never use it to derive a key that will encrypt something.
 */
export const PBKDF2_ITERATIONS_LEGACY = 1_000;

export interface DerivedKeyResult {
  masterKey: CryptoKey;
  rawKey: Uint8Array;
}

/**
 * Derive a master HKDF CryptoKey from password + salt via PBKDF2.
 * Returns both the HKDF CryptoKey (extractable=false) and the raw derived bytes.
 */
export async function derivePbkdf2Key(
  password: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS
): Promise<DerivedKeyResult> {
  const passKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations,
      hash: 'SHA-256',
    },
    passKey,
    256
  );
  const rawKey = new Uint8Array(derivedBits);
  const masterKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(rawKey),
    'HKDF',
    false, // HKDF keys must have extractable=false per WebCrypto spec
    ['deriveKey', 'deriveBits']
  );
  return { masterKey, rawKey };
}

/**
 * Derive master CryptoKey via Argon2id (if available) or PBKDF2.
 */
export async function deriveKey(password: string, salt: Uint8Array): Promise<DerivedKeyResult> {
  try {
    const argon2 = await getArgon2();
    const result = await argon2.hash({
      pass: password,
      salt,
      type: ArgonType.Argon2id,
      time: 3,
      mem: 65536, // 64 MB
      parallelism: 4,
      hashLen: 32,
    });
    const rawKey = new Uint8Array(result.hash);
    const masterKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(rawKey),
      'HKDF',
      false, // HKDF keys must have extractable=false per WebCrypto spec
      ['deriveKey', 'deriveBits']
    );
    return { masterKey, rawKey };
  } catch (err: any) {
    console.warn('[Crypto Warning] Argon2 WASM unavailable, falling back to WebCrypto PBKDF2:', err?.message || err);
    return derivePbkdf2Key(password, salt);
  }
}

export interface DerivedKeyWithFallbackResult {
  masterKey: CryptoKey;
  rawMasterKey: Uint8Array;
  fallbackMasterKey: CryptoKey | null;
  rawFallbackMasterKey: Uint8Array | null;
  /** PBKDF2 at the superseded iteration count — decrypt-only, for old vaults. */
  legacyMasterKey: CryptoKey | null;
  rawLegacyMasterKey: Uint8Array | null;
}

/**
 * Derives the primary (Argon2id or PBKDF2) and fallback master keys so a vault
 * stays readable even if Argon2 WASM availability changes between sessions.
 *
 * A third, legacy key is derived at PBKDF2_ITERATIONS_LEGACY purely so vaults
 * written before the iteration increase can still be opened and re-encrypted.
 * It must never be used to encrypt.
 */
export async function deriveKeyWithFallback(
  password: string,
  salt: Uint8Array
): Promise<DerivedKeyWithFallbackResult> {
  const { masterKey, rawKey: rawMasterKey } = await deriveKey(password, salt);

  let fallbackMasterKey: CryptoKey | null = null;
  let rawFallbackMasterKey: Uint8Array | null = null;
  try {
    const fallbackRes = await derivePbkdf2Key(password, salt);
    fallbackMasterKey = fallbackRes.masterKey;
    rawFallbackMasterKey = fallbackRes.rawKey;
  } catch {
    fallbackMasterKey = null;
    rawFallbackMasterKey = null;
  }

  let legacyMasterKey: CryptoKey | null = null;
  let rawLegacyMasterKey: Uint8Array | null = null;
  try {
    const legacyRes = await derivePbkdf2Key(password, salt, PBKDF2_ITERATIONS_LEGACY);
    legacyMasterKey = legacyRes.masterKey;
    rawLegacyMasterKey = legacyRes.rawKey;
  } catch {
    legacyMasterKey = null;
    rawLegacyMasterKey = null;
  }

  return {
    masterKey,
    rawMasterKey,
    fallbackMasterKey,
    rawFallbackMasterKey,
    legacyMasterKey,
    rawLegacyMasterKey,
  };
}

/**
 * Derive a 32-byte raw buffer from password + salt.
 * Used as intermediate material for HKDF in sessionKey.ts.
 */
export async function deriveRawKeyMaterial(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const argon2 = await getArgon2();
  const result = await argon2.hash({
    pass: password,
    salt,
    type: ArgonType.Argon2id,
    time: 3,
    mem: 65536,
    parallelism: 4,
    hashLen: 32,
  });

  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(result.hash),
    'HKDF',
    false,
    ['deriveKey', 'deriveBits']
  );
}
