import { describe, it, expect } from 'vitest';
import { setArgon2Available } from './mocks/argon2Mock';

// These exercise wrapping, which now refuses to run without Argon2 rather than
// silently substituting PBKDF2 and writing a wrap labelled with a KDF that did
// not make it.
setArgon2Available(true);
import {
  buildBundle,
  deriveSecretKek,
  derivePrfKek,
  envelopeFingerprint,
  generateDek,
  generateKeyId,
  generateRecoveryCode,
  normalizeRecoveryCode,
  randomBytes,
  unwrapBundle,
  verifyWrap,
  wrapBundle,
  type KeyEnvelope,
} from '../src/lib/crypto/keyEnvelope';

const TEACHER_ID = '11111111-2222-3333-4444-555555555555';

async function makeEnvelope(
  secret: string,
  kind: 'password' | 'recovery',
  dek: Uint8Array,
  keyId: Uint8Array,
  fallback: Uint8Array | null = null,
  legacy: Uint8Array | null = null,
): Promise<{ envelope: KeyEnvelope; kek: CryptoKey }> {
  const salt = randomBytes(16);
  const kek = await deriveSecretKek(secret, salt, kind);
  const wrapped = await wrapBundle(kek, buildBundle(dek, fallback, legacy), TEACHER_ID, kind, keyId);
  return {
    kek,
    envelope: {
      kind,
      credentialIdB64: null,
      kdf: 'argon2id',
      kdfSalt: salt,
      kdfParams: { t: 3, m: 65536, p: 4 },
      ...wrapped,
    },
  };
}

describe('key envelope', () => {
  it('round-trips the whole key bundle, not just the data key', async () => {
    // The decrypt chain walks primary -> fallback -> legacy, so a vault can hold
    // records that only open under a superseded key. Wrapping the data key alone
    // would strand them on the first passwordless login.
    const dek = generateDek();
    const fallback = randomBytes(32);
    const legacy = randomBytes(32);
    const keyId = generateKeyId();

    const { envelope, kek } = await makeEnvelope('a-long-passphrase', 'password', dek, keyId, fallback, legacy);
    const opened = await unwrapBundle(kek, envelope, TEACHER_ID, keyId);

    expect(Array.from(opened.dek)).toEqual(Array.from(dek));
    expect(Array.from(opened.fallback!)).toEqual(Array.from(fallback));
    expect(Array.from(opened.legacy!)).toEqual(Array.from(legacy));
  });

  it('refuses a wrong secret', async () => {
    const dek = generateDek();
    const keyId = generateKeyId();
    const { envelope } = await makeEnvelope('the-right-passphrase', 'password', dek, keyId);

    const wrongKek = await deriveSecretKek('the-wrong-passphrase', envelope.kdfSalt, 'password');
    await expect(unwrapBundle(wrongKek, envelope, TEACHER_ID, keyId)).rejects.toThrow();
  });

  it('binds a wrap to its account, factor and key generation', async () => {
    const dek = generateDek();
    const keyId = generateKeyId();
    const { envelope, kek } = await makeEnvelope('shared-secret', 'password', dek, keyId);

    // Same ciphertext, different account.
    await expect(
      unwrapBundle(kek, envelope, '99999999-9999-9999-9999-999999999999', keyId),
    ).rejects.toThrow();

    // Same ciphertext, replayed as a different factor.
    await expect(
      unwrapBundle(kek, { ...envelope, kind: 'recovery' }, TEACHER_ID, keyId),
    ).rejects.toThrow();

    // Same ciphertext, different data-key generation.
    await expect(unwrapBundle(kek, envelope, TEACHER_ID, generateKeyId())).rejects.toThrow();
  });

  it('derives a different key for each factor from the same secret', async () => {
    const dek = generateDek();
    const keyId = generateKeyId();
    const salt = randomBytes(16);

    const passwordKek = await deriveSecretKek('same-input', salt, 'password');
    const recoveryKek = await deriveSecretKek('same-input', salt, 'recovery');
    const wrapped = await wrapBundle(
      passwordKek,
      buildBundle(dek, null, null),
      TEACHER_ID,
      'password',
      keyId,
    );
    const envelope: KeyEnvelope = {
      kind: 'password',
      credentialIdB64: null,
      kdf: 'argon2id',
      kdfSalt: salt,
      kdfParams: {},
      ...wrapped,
    };

    await expect(unwrapBundle(recoveryKek, envelope, TEACHER_ID, keyId)).rejects.toThrow();
  });

  it('wraps under a passkey PRF secret', async () => {
    const dek = generateDek();
    const keyId = generateKeyId();
    const salt = randomBytes(16);
    const prfOutput = randomBytes(32);

    const kek = await derivePrfKek(prfOutput, salt);
    const wrapped = await wrapBundle(kek, buildBundle(dek, null, null), TEACHER_ID, 'passkey', keyId);
    const envelope: KeyEnvelope = {
      kind: 'passkey',
      credentialIdB64: 'Y3JlZA==',
      kdf: 'hkdf',
      kdfSalt: salt,
      kdfParams: {},
      ...wrapped,
    };

    expect(await verifyWrap(kek, envelope, TEACHER_ID, keyId, dek)).toBe(true);

    const otherKek = await derivePrfKek(randomBytes(32), salt);
    expect(await verifyWrap(otherKek, envelope, TEACHER_ID, keyId, dek)).toBe(false);
  });

  it('normalizes the characters the recovery alphabet leaves out', () => {
    // The alphabet omits I, L, O and U precisely because they are misread off
    // paper, so a code typed with them must still open the vault.
    expect(normalizeRecoveryCode('abcde-fghi j')).toBe('ABCDEFGH1J');
    expect(normalizeRecoveryCode('O0L1U')).toBe('0011V');
  });

  it('generates recovery codes that are grouped and non-repeating', () => {
    const code = generateRecoveryCode();
    expect(code.split('-')).toHaveLength(8);
    expect(code).not.toBe(generateRecoveryCode());
  });

  it('fingerprints an envelope set so a substituted one is detectable', async () => {
    const dek = generateDek();
    const keyId = generateKeyId();
    const { envelope } = await makeEnvelope('passphrase', 'password', dek, keyId);
    const { envelope: other } = await makeEnvelope('passphrase', 'password', dek, keyId);

    const first = await envelopeFingerprint({ keyId, envelopes: [envelope] });
    expect(await envelopeFingerprint({ keyId, envelopes: [envelope] })).toBe(first);
    // A fresh wrap of the same key has a different IV, so the set is different.
    expect(await envelopeFingerprint({ keyId, envelopes: [other] })).not.toBe(first);
  });
});
