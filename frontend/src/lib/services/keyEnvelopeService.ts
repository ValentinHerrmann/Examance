/**
 * Envelope lifecycle — how a signed-in browser gets hold of the data key.
 *
 * Three entry points matter:
 *
 *  - `openWithPassword` on a normal sign-in. On an account that predates the
 *    envelope it performs the one-time migration instead.
 *  - `openWithRecoveryCode` when the password is gone, which is what makes a
 *    password reset survivable.
 *  - `rewrapForNewPassword` / `rewrapForChangedPassword` after a reset or an
 *    in-session password change.
 *
 * None of these re-encrypt anything. The data key stays the same across a
 * password change; only its wraps are rewritten.
 */

import {
  deriveKeyWithFallback,
  getUserSalt,
  getUserSessionNonce,
} from '$lib/crypto/keyDerivation';
import { deriveSessionKey } from '$lib/crypto/sessionKey';
import { toArrayBuffer } from '$lib/crypto/aesGcm';
import {
  ENVELOPE_VERSION,
  KEK_KDF_PARAMS,
  buildBundle,
  derivePrfKek,
  deriveSecretKek,
  envelopeFingerprint,
  generateKeyId,
  generateRecoveryCode,
  normalizeRecoveryCode,
  randomBytes,
  unwrapBundle,
  unwrapWithSecret,
  verifyWrap,
  wrapBundle,
  type EnvelopeSet,
  type KeyEnvelope,
  type UnwrappedBundle,
} from '$lib/crypto/keyEnvelope';
import { fetchEnvelopes, saveEnvelopes } from '$lib/api/keyEnvelopes';
import { get } from 'svelte/store';
import { sessionStore } from '$lib/stores/session';
import { safeLocalStorage, safeSessionStorage } from '$lib/utils/storage';
import { base64ToUint8Array, uint8ArrayToBase64 } from '$lib/crypto/aesGcm';

const FINGERPRINT_PREFIX = 'bg_envelope_fp:';

/**
 * Compare credential ids without tripping over base64url padding.
 *
 * The server encodes with padding; `navigator.credentials` hands back an
 * unpadded id. Same bytes, different string — and a mismatch here would look
 * exactly like "this passkey has no wrap".
 */
function sameCredential(a: string | null, b: string | null): boolean {
  if (a === null || b === null) {
    return false;
  }
  return a.replace(/=+$/, '') === b.replace(/=+$/, '');
}
const KEY_ID_STORAGE = 'bg_key_id';

/**
 * Remember which data-key generation this session opened.
 *
 * Not a secret — it is a random label, and the point of recording it is that a
 * stored record can say which key sealed it. Kept in sessionStorage so it dies
 * with the tab alongside the keys themselves.
 */
export function rememberKeyId(keyId: Uint8Array): void {
  safeSessionStorage.setItem(KEY_ID_STORAGE, uint8ArrayToBase64(keyId));
}

/**
 * The current data-key generation, or 16 zero bytes when unknown.
 *
 * The zero value matches the placeholder identity rows the submissions endpoint
 * creates, and is what pre-envelope clients sent, so it stays a valid "no
 * generation recorded" marker rather than an error.
 */
export function currentKeyId(): Uint8Array {
  const stored = safeSessionStorage.getItem(KEY_ID_STORAGE);
  if (!stored) {
    return new Uint8Array(16);
  }
  try {
    const bytes = base64ToUint8Array(stored);
    return bytes.length === 16 ? bytes : new Uint8Array(16);
  } catch {
    return new Uint8Array(16);
  }
}

export function forgetKeyId(): void {
  safeSessionStorage.removeItem(KEY_ID_STORAGE);
}

/** The envelope set changed without this browser re-wrapping it. */
export class EnvelopeChangedError extends Error {
  constructor() {
    super('The stored key envelope changed unexpectedly.');
    this.name = 'EnvelopeChangedError';
  }
}

/** No wrap on the server matches the factor that was offered. */
export class EnvelopeFactorMissingError extends Error {
  constructor(kind: string) {
    super(`No usable ${kind} wrap is stored for this account.`);
    this.name = 'EnvelopeFactorMissingError';
  }
}

export interface OpenedVault extends UnwrappedBundle {
  keyId: Uint8Array;
  /** Set only when a new code was minted and must be shown to the teacher once. */
  newRecoveryCode?: string;
  /** True when this call performed the one-time migration from the derived key. */
  migrated: boolean;
}

function usable(set: EnvelopeSet, kind: KeyEnvelope['kind']): KeyEnvelope | null {
  return (
    set.envelopes.find((e) => e.kind === kind && !e.invalidatedAt) ?? null
  );
}

async function pinFingerprint(teacherId: string, set: EnvelopeSet): Promise<void> {
  safeLocalStorage.setItem(FINGERPRINT_PREFIX + teacherId, await envelopeFingerprint(set));
}

/**
 * Refuse to use an envelope set this browser has not seen before.
 *
 * A server that substitutes the set — serving one whose data key it knows —
 * would be able to read everything written afterwards. The AAD binding cannot
 * catch that, because the server would pick both sides of it. A pin can.
 */
async function assertPinnedOrPin(teacherId: string, set: EnvelopeSet): Promise<void> {
  const stored = safeLocalStorage.getItem(FINGERPRINT_PREFIX + teacherId);
  const current = await envelopeFingerprint(set);
  if (stored === null) {
    safeLocalStorage.setItem(FINGERPRINT_PREFIX + teacherId, current);
    return;
  }
  if (stored !== current) {
    throw new EnvelopeChangedError();
  }
}

/** Drop the pin, e.g. after a deliberate re-wrap on another device. */
export function clearFingerprint(teacherId: string): void {
  safeLocalStorage.removeItem(FINGERPRINT_PREFIX + teacherId);
}

async function buildSet(
  teacherId: string,
  keyId: Uint8Array,
  bundleSource: UnwrappedBundle,
  password: string | null,
  recoveryCode: string,
  keep: KeyEnvelope[] = [],
): Promise<EnvelopeSet> {
  const bundle = buildBundle(bundleSource.dek, bundleSource.fallback, bundleSource.legacy);
  const envelopes: KeyEnvelope[] = [...keep];

  if (password !== null) {
    const salt = randomBytes(16);
    const kek = await deriveSecretKek(password, salt, 'password');
    const wrapped = await wrapBundle(kek, bundle, teacherId, 'password', keyId);
    const envelope: KeyEnvelope = {
      kind: 'password',
      credentialIdB64: null,
      kdf: 'argon2id',
      kdfSalt: salt,
      kdfParams: { ...KEK_KDF_PARAMS },
      ...wrapped,
    };
    // Prove the wrap opens before it becomes the only copy of anything.
    if (!(await verifyWrap(kek, envelope, teacherId, keyId, bundleSource.dek))) {
      throw new Error('The password wrap failed its own round-trip check.');
    }
    envelopes.push(envelope);
  }

  const recoverySalt = randomBytes(16);
  const recoveryKek = await deriveSecretKek(
    normalizeRecoveryCode(recoveryCode),
    recoverySalt,
    'recovery',
  );
  const recoveryWrapped = await wrapBundle(recoveryKek, bundle, teacherId, 'recovery', keyId);
  const recoveryEnvelope: KeyEnvelope = {
    kind: 'recovery',
    credentialIdB64: null,
    kdf: 'argon2id',
    kdfSalt: recoverySalt,
    kdfParams: { ...KEK_KDF_PARAMS },
    ...recoveryWrapped,
  };
  if (!(await verifyWrap(recoveryKek, recoveryEnvelope, teacherId, keyId, bundleSource.dek))) {
    throw new Error('The recovery wrap failed its own round-trip check.');
  }
  envelopes.push(recoveryEnvelope);

  return { keyId, envelopes };
}

/**
 * Open the vault with the password, migrating the account if it has no envelope.
 *
 * The migration deliberately adopts the *existing* derived key as the data key
 * rather than minting a fresh one: every record already on disk and on the
 * server was sealed with it, so adopting it means nothing has to be re-encrypted
 * and there is no window in which a half-converted vault exists. This is also
 * the only moment at which the PBKDF2 fallback and legacy keys are available,
 * so they are captured into the bundle here or lost for good.
 */
export async function openWithPassword(
  teacherId: string,
  email: string,
  password: string,
): Promise<OpenedVault> {
  const existing = await fetchEnvelopes();

  if (existing === null) {
    const salt = await getUserSalt(email);
    const derived = await deriveKeyWithFallback(password, salt);
    const source: UnwrappedBundle = {
      dek: derived.rawMasterKey,
      fallback: derived.rawFallbackMasterKey,
      legacy: derived.rawLegacyMasterKey,
    };
    const keyId = generateKeyId();
    const recoveryCode = generateRecoveryCode();
    const set = await buildSet(teacherId, keyId, source, password, recoveryCode);
    await saveEnvelopes(set);
    await pinFingerprint(teacherId, set);
    return { ...source, keyId, newRecoveryCode: recoveryCode, migrated: true };
  }

  await assertPinnedOrPin(teacherId, existing);

  const envelope = usable(existing, 'password');
  if (envelope === null) {
    // Either the account never had a password wrap, or a server-side password
    // write (admin reset, CLI) invalidated it. Both mean: recover another way.
    throw new EnvelopeFactorMissingError('password');
  }

  const { bundle, usedFallbackKdf } = await unwrapWithSecret(
    password,
    envelope,
    teacherId,
    existing.keyId,
    'password',
  );
  const vault: OpenedVault = { ...bundle, keyId: existing.keyId, migrated: false };
  await healFallbackWrap(teacherId, vault, 'password', password, usedFallbackKdf);
  return vault;
}

/**
 * Rewrite a wrap that only opened under the superseded KDF.
 *
 * These exist because `deriveKey` used to substitute PBKDF2 whenever the Argon2
 * WASM failed to load, without recording that it had — so the wrap is labelled
 * `argon2id`, is not, and stops opening the moment the WASM does load. Repairing
 * it on the sign-in that noticed is what keeps that from being permanent.
 *
 * Best effort by design: the teacher is already through the door with the right
 * key, and a failure to write the repair must not take that away from them.
 */
async function healFallbackWrap(
  teacherId: string,
  vault: OpenedVault,
  kind: 'password' | 'recovery',
  secret: string,
  usedFallbackKdf: boolean,
): Promise<void> {
  if (!usedFallbackKdf) {
    return;
  }
  try {
    const set = await setWithReplacedWrap(teacherId, vault, kind, secret);
    await saveEnvelopes(set);
    await pinFingerprint(teacherId, set);
  } catch (err) {
    console.warn('[Crypto Warning] Could not rewrite the fallback-derived wrap:', err);
  }
}

/** Open the vault with the printable recovery code. */
export async function openWithRecoveryCode(
  teacherId: string,
  recoveryCode: string,
): Promise<OpenedVault> {
  const existing = await fetchEnvelopes();
  if (existing === null) {
    throw new EnvelopeFactorMissingError('recovery');
  }
  const envelope = usable(existing, 'recovery');
  if (envelope === null) {
    throw new EnvelopeFactorMissingError('recovery');
  }
  const normalized = normalizeRecoveryCode(recoveryCode);
  const { bundle, usedFallbackKdf } = await unwrapWithSecret(
    normalized,
    envelope,
    teacherId,
    existing.keyId,
    'recovery',
  );
  const vault: OpenedVault = { ...bundle, keyId: existing.keyId, migrated: false };
  await healFallbackWrap(teacherId, vault, 'recovery', normalized, usedFallbackKdf);
  return vault;
}

/**
 * Re-wrap the same data key under a new password, after a change or a reset.
 *
 * A fresh recovery code is issued at the same time: the old one either was just
 * spent recovering, or belongs to a password the teacher no longer uses.
 * Returns the code so the caller can show it exactly once.
 *
 * Passkey wraps are carried through, for the reason spelled out on
 * `setWithReplacedWrap`: rebuilding the set from two secrets deletes the wraps
 * for every factor those secrets do not cover.
 */
export async function rewrapForNewPassword(
  teacherId: string,
  vault: OpenedVault,
  newPassword: string,
): Promise<string> {
  const recoveryCode = generateRecoveryCode();
  const existing = await fetchEnvelopes();
  const set = await buildSet(
    teacherId,
    existing?.keyId ?? vault.keyId,
    { dek: vault.dek, fallback: vault.fallback, legacy: vault.legacy },
    newPassword,
    recoveryCode,
    (existing?.envelopes ?? []).filter((e) => e.kind === 'passkey'),
  );
  await saveEnvelopes(set);
  await pinFingerprint(teacherId, set);
  return recoveryCode;
}

/**
 * Rebuild exactly one Argon2id wrap, carrying every other one through untouched.
 *
 * The distinction this exists to enforce: `saveEnvelopes` replaces the whole set,
 * and `buildSet` can only emit the wraps it is handed a secret for. So building a
 * set to change *one* factor silently deletes the wraps for the others — a
 * teacher's passkeys stop opening their vault, and nothing says so until the day
 * they try. Only the named wrap is rebuilt here; the rest stay as the opaque
 * ciphertext they are, holding the same data key.
 */
async function setWithReplacedWrap(
  teacherId: string,
  vault: OpenedVault,
  kind: 'password' | 'recovery',
  secret: string,
): Promise<EnvelopeSet> {
  const existing = await fetchEnvelopes();
  const keyId = existing?.keyId ?? vault.keyId;
  const kept = (existing?.envelopes ?? []).filter((e) => e.kind !== kind);

  const salt = randomBytes(16);
  const kek = await deriveSecretKek(secret, salt, kind);
  const bundle = buildBundle(vault.dek, vault.fallback, vault.legacy);
  const wrapped = await wrapBundle(kek, bundle, teacherId, kind, keyId);

  const envelope: KeyEnvelope = {
    kind,
    credentialIdB64: null,
    kdf: 'argon2id',
    kdfSalt: salt,
    kdfParams: { ...KEK_KDF_PARAMS },
    ...wrapped,
  };
  // Prove the wrap opens before it becomes the only copy of anything.
  if (!(await verifyWrap(kek, envelope, teacherId, keyId, vault.dek))) {
    throw new Error(`The ${kind} wrap failed its own round-trip check.`);
  }

  return { keyId, envelopes: [...kept, envelope] };
}

/**
 * Issue a replacement recovery code from an already-open vault.
 *
 * Codes are single-use and shown once, so a teacher who mislays one needs a way
 * back that does not involve losing their data.
 */
export async function regenerateRecoveryCode(
  teacherId: string,
  vault: OpenedVault,
): Promise<string> {
  const recoveryCode = generateRecoveryCode();
  const set = await setWithReplacedWrap(
    teacherId,
    vault,
    'recovery',
    normalizeRecoveryCode(recoveryCode),
  );
  await saveEnvelopes(set);
  await pinFingerprint(teacherId, set);
  return recoveryCode;
}

/**
 * Re-wrap the data key for an in-session password change.
 *
 * Returns the set rather than saving it: the server writes the password and its
 * key copy in one transaction, so this travels inside the change-password
 * request. The recovery wrap is carried through untouched — it cannot be rebuilt
 * without the code's plaintext, which is gone, and it holds the same data key
 * regardless. Pin the returned set with `pinEnvelopeSet` once the request
 * succeeds.
 */
export async function rewrapForChangedPassword(
  teacherId: string,
  vault: OpenedVault,
  newPassword: string,
): Promise<EnvelopeSet> {
  return setWithReplacedWrap(teacherId, vault, 'password', newPassword);
}

export { ENVELOPE_VERSION };

/** The shape `sessionStore.unlock` expects, derived from an opened vault. */
export interface SessionKeyMaterial {
  masterKey: CryptoKey;
  masterKeyRaw: Uint8Array;
  sessionKey: CryptoKey;
  fallbackSessionKey: CryptoKey | null;
  fallbackMasterKeyRaw: Uint8Array | null;
  legacySessionKey: CryptoKey | null;
  legacyMasterKeyRaw: Uint8Array | null;
  sessionNonce: Uint8Array;
}

async function importHkdf(raw: Uint8Array): Promise<CryptoKey> {
  // HKDF keys must be non-extractable per the WebCrypto spec.
  return crypto.subtle.importKey('raw', toArrayBuffer(raw), 'HKDF', false, [
    'deriveKey',
    'deriveBits',
  ]);
}

/**
 * Turn an opened vault into the keys the session store holds.
 *
 * The session nonce stays `getUserSessionNonce(email)`. It is HKDF salt rather
 * than a secret, and every record already written — locally and, in server
 * modes, on the server — was sealed under it. Because the migration adopts the
 * previously derived key as the DEK, the session key produced here is
 * byte-identical to the one the old scheme produced, which is what lets the
 * change land without re-encrypting anything.
 */
export async function materializeSession(
  vault: OpenedVault,
  email: string,
): Promise<SessionKeyMaterial> {
  rememberKeyId(vault.keyId);
  const sessionNonce = await getUserSessionNonce(email);
  const masterKey = await importHkdf(vault.dek);
  const sessionKey = await deriveSessionKey(masterKey, sessionNonce);

  const fallbackSessionKey = vault.fallback
    ? await deriveSessionKey(await importHkdf(vault.fallback), sessionNonce)
    : null;
  const legacySessionKey = vault.legacy
    ? await deriveSessionKey(await importHkdf(vault.legacy), sessionNonce)
    : null;

  return {
    masterKey,
    masterKeyRaw: vault.dek,
    sessionKey,
    fallbackSessionKey,
    fallbackMasterKeyRaw: vault.fallback,
    legacySessionKey,
    legacyMasterKeyRaw: vault.legacy,
    sessionNonce,
  };
}

/**
 * Build the envelope set for a password reset, without saving it.
 *
 * The reset endpoint writes the new password and this set in one transaction:
 * two round trips could leave a teacher whose password changed but whose key
 * copy did not, which looks like a working account right up until the next
 * sign-in opens nothing.
 *
 * Returns the fresh recovery code alongside, to be shown exactly once — the old
 * one was just spent getting here.
 *
 * Passkey wraps are carried through. Rebuilding the set from the password and
 * the new code alone would drop them, and a teacher would come out of a reset
 * with passkeys that still sign in and no longer open anything — a loss with no
 * symptom until they next tried.
 */
export async function buildResetEnvelopeSet(
  teacherId: string,
  vault: OpenedVault,
  newPassword: string,
): Promise<{ set: EnvelopeSet; recoveryCode: string }> {
  const recoveryCode = generateRecoveryCode();
  const existing = await fetchEnvelopes();
  const set = await buildSet(
    teacherId,
    existing?.keyId ?? vault.keyId,
    { dek: vault.dek, fallback: vault.fallback, legacy: vault.legacy },
    newPassword,
    recoveryCode,
    (existing?.envelopes ?? []).filter((e) => e.kind === 'passkey'),
  );
  return { set, recoveryCode };
}

/**
 * Pin an envelope set this browser did not write itself.
 *
 * Used right after a reset: the set was just uploaded inside the reset request,
 * so it is known-good here even though `saveEnvelopes` was not the one to store
 * it.
 */
export async function pinEnvelopeSet(teacherId: string, set: EnvelopeSet): Promise<void> {
  await pinFingerprint(teacherId, set);
}

/**
 * Reconstruct the opened vault from the live session.
 *
 * The session already holds the data key and the rest of the decrypt chain — it
 * has to, to read anything — so adding a wrap later does not need the password
 * again.
 */
export function vaultFromSession(): OpenedVault | null {
  const state = get(sessionStore);
  if (!state.masterKeyRaw) {
    return null;
  }
  return {
    dek: state.masterKeyRaw,
    fallback: state.fallbackMasterKeyRaw,
    legacy: state.legacyMasterKeyRaw,
    keyId: currentKeyId(),
    migrated: false,
  };
}

/**
 * Add a passkey's PRF wrap to the existing set.
 *
 * The password and recovery wraps are carried through untouched — they are
 * opaque ciphertext from here, and re-deriving them would need secrets this
 * code does not have. Only the new wrap is built.
 *
 * Called after registering a PRF-capable passkey, from an open session.
 */
export async function addPasskeyWrap(
  teacherId: string,
  vault: OpenedVault,
  credentialIdB64: string,
  prfOutput: Uint8Array,
): Promise<void> {
  const existing = await fetchEnvelopes();
  if (existing === null) {
    throw new EnvelopeFactorMissingError('recovery');
  }

  const salt = randomBytes(16);
  const kek = await derivePrfKek(prfOutput, salt);
  const bundle = buildBundle(vault.dek, vault.fallback, vault.legacy);
  const wrapped = await wrapBundle(kek, bundle, teacherId, 'passkey', existing.keyId);

  const envelope: KeyEnvelope = {
    kind: 'passkey',
    credentialIdB64,
    kdf: 'hkdf',
    kdfSalt: salt,
    kdfParams: {},
    ...wrapped,
  };
  if (!(await verifyWrap(kek, envelope, teacherId, existing.keyId, vault.dek))) {
    throw new Error('The passkey wrap failed its own round-trip check.');
  }

  const kept = existing.envelopes.filter(
    (e) => !(e.kind === 'passkey' && sameCredential(e.credentialIdB64, credentialIdB64)),
  );
  const set: EnvelopeSet = { keyId: existing.keyId, envelopes: [...kept, envelope] };
  await saveEnvelopes(set);
  await pinFingerprint(teacherId, set);
}

/** Open the vault with a passkey's PRF secret. */
export async function openWithPasskey(
  teacherId: string,
  credentialIdB64: string,
  prfOutput: Uint8Array,
): Promise<OpenedVault> {
  const existing = await fetchEnvelopes();
  if (existing === null) {
    throw new EnvelopeFactorMissingError('passkey');
  }
  const envelope = existing.envelopes.find(
    (e) =>
      e.kind === 'passkey' &&
      sameCredential(e.credentialIdB64, credentialIdB64) &&
      !e.invalidatedAt,
  );
  if (!envelope) {
    throw new EnvelopeFactorMissingError('passkey');
  }
  const kek = await derivePrfKek(prfOutput, envelope.kdfSalt);
  const bundle = await unwrapBundle(kek, envelope, teacherId, existing.keyId);
  return { ...bundle, keyId: existing.keyId, migrated: false };
}
