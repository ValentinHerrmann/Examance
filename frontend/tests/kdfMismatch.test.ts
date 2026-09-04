import { describe, it, expect, beforeEach } from 'vitest';
import { setArgon2Available } from './mocks/argon2Mock';
import {
  buildBundle,
  deriveFallbackSecretKek,
  deriveSecretKek,
  generateDek,
  generateKeyId,
  randomBytes,
  unwrapWithSecret,
  wrapBundle,
  type KeyEnvelope,
} from '../src/lib/crypto/keyEnvelope';
import { Argon2UnavailableError } from '../src/lib/crypto/keyDerivation';

/**
 * The failure this pins locked an account out of its own data.
 *
 * `deriveKey` used to fall back to PBKDF2 whenever the Argon2 WASM failed to
 * load, silently and without recording it. A wrap written on a page where the
 * WASM loaded could then never be opened on one where it did not, and the
 * sign-in reported a wrong password about a correct one.
 *
 * The suite could not see it: the argon2 mock always threw, so wrapping and
 * unwrapping ran the same branch and could never disagree.
 */

const TEACHER_ID = '11111111-2222-3333-4444-555555555555';
const SECRET = 'a-correct-password-1';

async function wrapUnder(
  argon2: boolean,
  dek: Uint8Array,
  keyId: Uint8Array,
): Promise<KeyEnvelope> {
  const salt = randomBytes(16);
  setArgon2Available(argon2);
  const kek = argon2
    ? await deriveSecretKek(SECRET, salt, 'password')
    : await deriveFallbackSecretKek(SECRET, salt, 'password');
  const wrapped = await wrapBundle(
    kek,
    buildBundle(dek, null, null),
    TEACHER_ID,
    'password',
    keyId,
  );
  return {
    kind: 'password',
    credentialIdB64: null,
    // Labelled argon2id either way — which is precisely the lie the old
    // fallback told, and why the label cannot be trusted on read.
    kdf: 'argon2id',
    kdfSalt: salt,
    kdfParams: { t: 3, m: 65536, p: 4 },
    ...wrapped,
  };
}

describe('a wrap written under one KDF and opened under the other', () => {
  const dek = generateDek();
  const keyId = generateKeyId();

  beforeEach(() => setArgon2Available(true));

  it('opens a wrap that Argon2 made', async () => {
    const envelope = await wrapUnder(true, dek, keyId);
    setArgon2Available(true);

    const { bundle, usedFallbackKdf } = await unwrapWithSecret(
      SECRET,
      envelope,
      TEACHER_ID,
      keyId,
      'password',
    );
    expect(Array.from(bundle.dek)).toEqual(Array.from(dek));
    expect(usedFallbackKdf).toBe(false);
  });

  it('still opens a wrap the old fallback made, and says so', async () => {
    const envelope = await wrapUnder(false, dek, keyId);
    // Argon2 is back — the state in which such a wrap used to become permanently
    // unopenable, and the account got "that password is not correct".
    setArgon2Available(true);

    const { bundle, usedFallbackKdf } = await unwrapWithSecret(
      SECRET,
      envelope,
      TEACHER_ID,
      keyId,
      'password',
    );
    expect(Array.from(bundle.dek)).toEqual(Array.from(dek));
    // The flag is what triggers rewriting the wrap under Argon2, so the account
    // stops depending on the fallback.
    expect(usedFallbackKdf).toBe(true);
  });

  it('says Argon2 is unavailable rather than blaming the password', async () => {
    // An Argon2-made wrap genuinely cannot be opened without Argon2 — nothing can
    // fix that here. What matters is that the teacher is told the browser could
    // not load the key derivation, not that their correct password is wrong.
    const envelope = await wrapUnder(true, dek, keyId);
    setArgon2Available(false);

    await expect(
      unwrapWithSecret(SECRET, envelope, TEACHER_ID, keyId, 'password'),
    ).rejects.toThrow(Argon2UnavailableError);
  });

  it('still rejects a wrong secret rather than trying its way in', async () => {
    const envelope = await wrapUnder(true, dek, keyId);
    setArgon2Available(true);

    await expect(
      unwrapWithSecret('not-the-password', envelope, TEACHER_ID, keyId, 'password'),
    ).rejects.toThrow();
  });

  it('refuses to write a wrap when Argon2 is unavailable', async () => {
    // The alternative is what caused this: a wrap that only PBKDF2 opens,
    // labelled argon2id, written without anyone being told.
    setArgon2Available(false);
    await expect(deriveSecretKek(SECRET, randomBytes(16), 'password')).rejects.toThrow(
      Argon2UnavailableError,
    );
  });
});
