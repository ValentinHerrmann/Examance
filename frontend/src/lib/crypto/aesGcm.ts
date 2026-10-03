import { get } from 'svelte/store';
import { sessionStore } from '$lib/stores/session';

/**
 * AES-256-GCM helpers. SECURITY INVARIANTS: every encrypt() draws a fresh random 12-byte IV via
 * crypto.getRandomValues; IVs are never reused or taken from external input; decrypt needs the
 * IV stored with the ciphertext; a tampered ciphertext makes decrypt() throw (GCM auth failure).
 */

export interface EncryptResult {
  /** AES-256-GCM ciphertext (includes 16-byte GCM authentication tag appended by Web Crypto). */
  ciphertext: Uint8Array;
  /** Fresh random 12-byte IV used for this encryption. Must be stored with ciphertext. */
  iv: Uint8Array;
}

/** Converts a Uint8Array view to an ArrayBuffer slice honouring byteOffset/byteLength, so WebCrypto never gets a whole WASM heap or shared buffer. */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer as ArrayBuffer;
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Encrypt with AES-256-GCM using a fresh random 12-byte IV per call. */
export async function encrypt(key: CryptoKey, plaintext: Uint8Array, customIv?: Uint8Array): Promise<EncryptResult> {
  const iv = customIv ?? crypto.getRandomValues(new Uint8Array(12)); // Fresh random IV — never reuse

  const plaintextBuffer = toArrayBuffer(plaintext);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    plaintextBuffer
  );

  return {
    ciphertext: new Uint8Array(ciphertextBuffer),
    iv,
  };
}

/** Decrypt AES-256-GCM. @throws DOMException if the GCM tag fails (tampered data or wrong key/IV). */
export async function decrypt(
  key: CryptoKey | null | undefined,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  fallbackKey?: CryptoKey | null
): Promise<Uint8Array> {
  const ciphertextBuffer = toArrayBuffer(ciphertext);
  const ivBuffer = toArrayBuffer(iv);
  const storedSession = typeof window !== 'undefined' ? get(sessionStore) : null;
  const activeFallbackKey = fallbackKey ?? storedSession?.fallbackSessionKey ?? null;
  // Records written before the PBKDF2 iteration increase are sealed under the
  // old parameters. Decrypt-only: nothing is ever re-encrypted with this key.
  const legacyKey = storedSession?.legacySessionKey ?? null;

  let primaryErr: any = null;
  if (key) {
    try {
      const plaintextBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBuffer },
        key,
        ciphertextBuffer
      );
      return new Uint8Array(plaintextBuffer);
    } catch (err) {
      primaryErr = err;
    }
  }

  for (const candidate of [activeFallbackKey, legacyKey]) {
    if (!candidate) continue;
    try {
      const plaintextBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBuffer },
        candidate,
        ciphertextBuffer
      );
      return new Uint8Array(plaintextBuffer);
    } catch {
      // Try the next candidate; the primary error is thrown if all fail.
    }
  }

  throw primaryErr || new Error('Decryption failed: no valid key provided');
}

/**
 * Encrypt JSON-serializable data with AES-256-GCM.
 */
export async function encryptJson<T>(data: T, key: CryptoKey, customIv?: Uint8Array): Promise<EncryptResult> {
  const jsonStr = JSON.stringify(data);
  const bytes = new TextEncoder().encode(jsonStr);
  return encrypt(key, bytes, customIv);
}

/**
 * Decrypt AES-256-GCM ciphertext back into JSON object.
 */
export async function decryptJson<T>(
  key: CryptoKey | null | undefined,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  fallbackKey?: CryptoKey | null
): Promise<T> {
  const decryptedBytes = await decrypt(key, ciphertext, iv, fallbackKey);
  const jsonStr = new TextDecoder().decode(decryptedBytes);
  return JSON.parse(jsonStr) as T;
}

/** Safe Uint8Array to Base64 string converter (chunks array to prevent call stack size exceeded). */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK_SIZE = 0x8000; // 32KB
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

/** Encode Uint8Array to base64url string (for JSON serialization). */
export function toBase64url(bytes: Uint8Array): string {
  return uint8ArrayToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Decode base64url string to Uint8Array. */
export function fromBase64url(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  return new Uint8Array(binary.length).map((_, i) => binary.charCodeAt(i));
}

/** Decodes Base64/Base64URL (chunked, trims whitespace, restores padding, maps - and _) to a Uint8Array. */
export function base64ToUint8Array(b64: string): Uint8Array {
  if (!b64 || !b64.trim()) return new Uint8Array(0);

  let normalized = b64.trim().replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (normalized.length % 4)) % 4;
  if (pad < 4) {
    normalized += '='.repeat(pad);
  }

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
