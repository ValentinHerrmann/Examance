/** Session key derivation: HKDF from master key + nonce. The session key encrypts IDB entries; the master key is only used to re-derive it on unlock. */

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
    true, // extractable: sealed into tab storage (crypto/sessionWrap.ts) and handed to other tabs
    ['encrypt', 'decrypt']
  );
}
