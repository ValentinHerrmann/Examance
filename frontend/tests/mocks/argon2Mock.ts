/**
 * Stand-in for `argon2-browser` in the node test environment.
 *
 * It used to throw unconditionally, which meant the whole suite ran on the
 * PBKDF2 fallback and wrap/unwrap could never disagree about which KDF made a
 * key. That is exactly the failure that reached production: an envelope wrapped
 * under one and opened under the other. The switch exists so a test can put the
 * two sides in different states on purpose.
 *
 * The "available" implementation is *not* Argon2 — it is a cheap, deterministic
 * stand-in. Tests here care only that it produces a different key from PBKDF2
 * for the same inputs, which is the whole point of the mismatch.
 */
let available = false;

export function setArgon2Available(value: boolean): void {
  available = value;
}

async function fakeHash(pass: string, salt: Uint8Array, hashLen: number): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const material = encoder.encode(`argon2-mock|${pass}|`);
  const seed = new Uint8Array(material.length + salt.length);
  seed.set(material);
  seed.set(salt, material.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', seed));
  return digest.slice(0, hashLen);
}

export default {
  hash: async (options: { pass: string; salt: Uint8Array; hashLen?: number }) => {
    if (!available) {
      throw new Error('Argon2 WASM not available in node test environment');
    }
    return { hash: await fakeHash(options.pass, options.salt, options.hashLen ?? 32) };
  },
};
