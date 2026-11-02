const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Code characters for *bytes*, one per byte; the alphabet has 32 letters, so `b % 32` is unbiased. */
export function codeFromBytes(bytes: Uint8Array, length = bytes.length): string {
  return Array.from(bytes.subarray(0, length), (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Random code from an unambiguous alphabet (no 0/O, 1/I); 8 characters ≈ 40 bits, so codes of one exam never collide in practice (F9). */
export function randomCode(length = 8): string {
  return codeFromBytes(crypto.getRandomValues(new Uint8Array(length)));
}
