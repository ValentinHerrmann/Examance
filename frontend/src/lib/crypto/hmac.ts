import { toArrayBuffer } from './aesGcm';

/**
 * Client-side HMAC-SHA-256 helpers for pseudonym IDs:
 * pseudonym_hmac = HMAC-SHA256(raw_pseudonym_uuid, per_exam_secret). The server only sees the HMAC, never the raw UUID.
 */

/** Import 32-byte raw key material (e.g. from HKDF) as an HMAC-SHA-256 CryptoKey. */
export async function importHmacKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyBytes),
    { name: 'HMAC', hash: 'SHA-256' },
    false, // non-extractable
    ['sign', 'verify']
  );
}

/** HMAC-SHA-256(message, key) as 64-char lowercase hex; `key` comes from importHmacKey. */
export async function hmacSha256Hex(message: string, key: CryptoKey): Promise<string> {
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message)
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** HMAC pseudonym ID from a student UUID and a 32-byte per-exam secret (from HKDF). */
export async function hmacPseudonymId(
  rawPseudonymId: string,
  examSecretBytes: Uint8Array
): Promise<string> {
  const key = await importHmacKey(examSecretBytes);
  return hmacSha256Hex(rawPseudonymId, key);
}

/** Returns a 64-char hex string for pseudonym_hmac backend fields: input as-is if already 64 chars, else its SHA-256 hex. */
export async function ensure64CharHex(idStr: string): Promise<string> {
  if (idStr && idStr.length === 64) {
    return idStr;
  }
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(idStr || ''));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
