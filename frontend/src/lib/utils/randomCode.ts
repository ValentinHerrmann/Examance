const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Random code from an unambiguous alphabet (no 0/O, 1/I); 8 characters ≈ 40 bits, so codes of one exam never collide in practice (F9). */
export function randomCode(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}
