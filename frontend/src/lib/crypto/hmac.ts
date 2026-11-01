/** HMAC-SHA-256 primitive for the keyed pseudonyms of `crypto/pseudonymKey.ts`; the server only ever sees the result. */

/** HMAC-SHA-256(message, key) as 64-char lowercase hex. */
export async function hmacSha256Hex(message: string, key: CryptoKey): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
}
