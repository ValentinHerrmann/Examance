/**
 * Stand-in for `argon2-browser` in the node test environment. The switch lets a test put wrap
 * and unwrap in different KDF states on purpose (an envelope wrapped under one KDF and opened
 * under the other reached production when the mock always threw). The "available"
 * implementation is a cheap deterministic stand-in, not Argon2; it only needs to differ from
 * PBKDF2 for the same inputs.
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
