/**
 * Session key derivation: HKDF from master key + nonce. The session key encrypts IDB entries;
 * the master key is only used to re-derive it on unlock.
 */

import { writable, derived, get } from 'svelte/store';
import { deriveKey, generateSalt } from '#lib/crypto/keyDerivation';
import { toArrayBuffer } from '#lib/crypto/aesGcm';

/** 12-byte nonce for session key derivation. */
export function generateSessionNonce(): Uint8Array {
  const nonce = new Uint8Array(12);
  crypto.getRandomValues(nonce);
  return nonce;
}

/** Derive a non-extractable, encrypt+decrypt-only session AES-256-GCM key from masterKey + nonce via HKDF-SHA-256. */
export async function deriveSessionKey(
  masterKey: CryptoKey,
  nonce: Uint8Array
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(nonce),
      info: new TextEncoder().encode('blindgrade-session-key-v1'),
    },
    masterKey,
    { name: 'AES-GCM', length: 256 },
    true, // extractable for tab session storage
    ['encrypt', 'decrypt']
  );
}

/** Legacy session key using the old app context ('blindgrade-session-key-v1'), for pre-rename encrypted session stores. */
export async function deriveLegacySessionKey(
  masterKey: CryptoKey,
  nonce: Uint8Array
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(nonce),
      info: new TextEncoder().encode('blindgrade-session-key-v1'),
    },
    masterKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/** Derive the archive secret (raw bits) from masterKey via HKDF, for pseudonym HMAC in .bgproj archives; purpose matches ARCHIVE_SECRET_PURPOSE in format.ts. */
export async function deriveArchiveSecret(masterKey: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(16), // Fixed zero-salt for deterministic derivation
      info: new TextEncoder().encode('bgproj-link'),
    },
    masterKey,
    256 // 32 bytes
  );
}
