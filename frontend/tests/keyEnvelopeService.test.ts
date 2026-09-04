import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setArgon2Available } from './mocks/argon2Mock';

// These exercise wrapping, which now refuses to run without Argon2 rather than
// silently substituting PBKDF2 and writing a wrap labelled with a KDF that did
// not make it.
setArgon2Available(true);
import {
  buildBundle,
  derivePrfKek,
  generateDek,
  generateKeyId,
  randomBytes,
  wrapBundle,
  type EnvelopeSet,
  type KeyEnvelope,
} from '../src/lib/crypto/keyEnvelope';

/**
 * The failure these guard against destroys key material silently.
 *
 * `saveEnvelopes` replaces the whole set, and the set builder can only emit the
 * wraps it was handed a secret for. So rebuilding a set to change *one* factor
 * drops the wraps for every other one — a teacher's passkeys keep signing them
 * in and stop opening their vault, with no symptom until the day they need it.
 * Worth asserting directly rather than hoping an end-to-end test walks over it.
 */

const TEACHER_ID = '11111111-2222-3333-4444-555555555555';

let stored: EnvelopeSet | null = null;
let saved: EnvelopeSet | null = null;

vi.mock('../src/lib/api/keyEnvelopes', () => ({
  fetchEnvelopes: async () => stored,
  saveEnvelopes: async (set: EnvelopeSet) => {
    saved = set;
  },
  envelopeSetToDto: (set: EnvelopeSet) => set,
}));

const { regenerateRecoveryCode, rewrapForChangedPassword } = await import(
  '../src/lib/services/keyEnvelopeService'
);

async function passkeyEnvelope(dek: Uint8Array, keyId: Uint8Array): Promise<KeyEnvelope> {
  const salt = randomBytes(16);
  const kek = await derivePrfKek(randomBytes(32), salt);
  const wrapped = await wrapBundle(kek, buildBundle(dek, null, null), TEACHER_ID, 'passkey', keyId);
  return {
    kind: 'passkey',
    credentialIdB64: 'Y3JlZC1vbmU=',
    kdf: 'hkdf',
    kdfSalt: salt,
    kdfParams: {},
    ...wrapped,
  };
}

describe('replacing one wrap', () => {
  const dek = generateDek();
  const keyId = generateKeyId();
  const vault = { dek, fallback: null, legacy: null, keyId, migrated: false };

  beforeEach(async () => {
    saved = null;
    stored = {
      keyId,
      envelopes: [await passkeyEnvelope(dek, keyId)],
    };
  });

  it('keeps the passkey wraps when a new recovery code is issued', async () => {
    await regenerateRecoveryCode(TEACHER_ID, vault);

    expect(saved).not.toBeNull();
    const kinds = saved!.envelopes.map((e) => e.kind).sort();
    expect(kinds).toEqual(['passkey', 'recovery']);
  });

  it('keeps the passkey wraps when the password changes', async () => {
    // A recovery wrap this browser cannot rebuild — the code's plaintext is
    // gone — has to survive a password change untouched.
    stored!.envelopes.push({
      ...(await passkeyEnvelope(dek, keyId)),
      kind: 'recovery',
      credentialIdB64: null,
    });

    const set = await rewrapForChangedPassword(TEACHER_ID, vault, 'a-new-password-12');

    const kinds = set.envelopes.map((e) => e.kind).sort();
    expect(kinds).toEqual(['passkey', 'password', 'recovery']);
    // Built, not saved: the change-password request writes it alongside the
    // password so the two cannot end up disagreeing.
    expect(saved).toBeNull();
  });

  it('replaces rather than duplicates the wrap it rebuilds', async () => {
    await regenerateRecoveryCode(TEACHER_ID, vault);
    stored = saved;
    await regenerateRecoveryCode(TEACHER_ID, vault);

    const recovery = saved!.envelopes.filter((e) => e.kind === 'recovery');
    expect(recovery).toHaveLength(1);
  });
});
