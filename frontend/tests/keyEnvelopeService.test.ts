// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setArgon2Available } from './mocks/argon2Mock';

// These exercise wrapping, which now refuses to run without Argon2 rather than silently substituting PBKDF2 and writing a wrap labelled with a KDF that did not make it.
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

/** Guards silent key-material loss: `saveEnvelopes` replaces the whole set and the builder only emits wraps it was given a secret for, so rebuilding to change *one* factor drops the others (e.g. passkeys still sign in but no longer open the vault). */

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

const {
  EnvelopeChangedError,
  openAcceptingChange,
  openWithPasskey,
  openWithRecoveryCode,
  regenerateRecoveryCode,
  rewrapForChangedPassword,
} = await import('../src/lib/services/keyEnvelopeService');

async function passkeyEnvelope(
  dek: Uint8Array,
  keyId: Uint8Array,
  prf: Uint8Array = randomBytes(32),
): Promise<KeyEnvelope> {
  const salt = randomBytes(16);
  const kek = await derivePrfKek(prf, salt);
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
    // A recovery wrap this browser cannot rebuild — the code's plaintext is gone — has to survive a password change untouched.
    stored!.envelopes.push({
      ...(await passkeyEnvelope(dek, keyId)),
      kind: 'recovery',
      credentialIdB64: null,
    });

    const set = await rewrapForChangedPassword(TEACHER_ID, vault, 'a-new-password-12');

    const kinds = set.envelopes.map((e) => e.kind).sort();
    expect(kinds).toEqual(['passkey', 'password', 'recovery']);
    // Built, not saved: the change-password request writes it alongside the password so the two cannot end up disagreeing.
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

/** Issue #180: every open path refuses an unseen envelope set until the teacher confirms the change, and pins only a set that actually opened. */
describe('envelope fingerprint pin', () => {
  const PIN_KEY = 'bg_envelope_fp:' + TEACHER_ID;
  const CRED = 'Y3JlZC1vbmU=';
  const dek = generateDek();
  const keyId = generateKeyId();
  const prf = randomBytes(32);

  async function freshSet(): Promise<EnvelopeSet> {
    return { keyId, envelopes: [await passkeyEnvelope(dek, keyId, prf)] };
  }
  const openPasskey = () => openWithPasskey(TEACHER_ID, CRED, prf);

  beforeEach(async () => {
    localStorage.clear();
    stored = await freshSet();
  });

  it('pins the set on the first successful open and refuses a changed one', async () => {
    await openPasskey();
    expect(localStorage.getItem(PIN_KEY)).not.toBeNull();

    stored = await freshSet();
    await expect(openPasskey()).rejects.toBeInstanceOf(EnvelopeChangedError);
  });

  it('refuses a changed set on the recovery path before unwrapping', async () => {
    await openPasskey();
    stored = await freshSet();
    stored.envelopes.push({ ...stored.envelopes[0], kind: 'recovery', credentialIdB64: null });

    const err = await openWithRecoveryCode(TEACHER_ID, 'ABCD-EFGH').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EnvelopeChangedError);
    expect((err as InstanceType<typeof EnvelopeChangedError>).teacherId).toBe(TEACHER_ID);
  });

  it('keeps blocking when the teacher does not confirm', async () => {
    await openPasskey();
    const pinned = localStorage.getItem(PIN_KEY);
    stored = await freshSet();

    await expect(openAcceptingChange(openPasskey, async () => false)).rejects.toBeInstanceOf(
      EnvelopeChangedError,
    );
    expect(localStorage.getItem(PIN_KEY)).toBe(pinned);
  });

  it('opens and pins the new set after an explicit confirmation', async () => {
    await openPasskey();
    const pinned = localStorage.getItem(PIN_KEY);
    stored = await freshSet();
    const confirm = vi.fn(async () => true);

    const vault = await openAcceptingChange(openPasskey, confirm);

    expect(confirm).toHaveBeenCalledOnce();
    expect(vault.dek).toEqual(dek);
    expect(localStorage.getItem(PIN_KEY)).not.toBeNull();
    expect(localStorage.getItem(PIN_KEY)).not.toBe(pinned);
  });

  it('never pins a set that failed to open', async () => {
    await expect(openWithPasskey(TEACHER_ID, CRED, randomBytes(32))).rejects.toThrow();
    expect(localStorage.getItem(PIN_KEY)).toBeNull();
  });
});
