import { toArrayBuffer } from './aesGcm';

/** Lowercase hex of the bytes, two digits each: the one hex encoder for hashes, fingerprints and lookup keys. */
export function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 of a UTF-8 string or of raw bytes, as lowercase hex. */
export async function sha256Hex(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const buffer = bytes instanceof Uint8Array ? toArrayBuffer(bytes) : bytes;
  return bytesToHex(await crypto.subtle.digest('SHA-256', buffer));
}
