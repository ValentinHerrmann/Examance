/**
 * Envelope lifecycle: how a signed-in browser gets the data key. `openWithPassword` on normal sign-in
 * (one-time migration for pre-envelope accounts); `openWithRecoveryCode` when the password is gone (makes
 * reset survivable); `rewrapForNewPassword`/`rewrapForChangedPassword` after reset/in-session change.
 * None re-encrypt anything: the data key is stable, only its wraps are rewritten.
 */

import {
  deriveKeyWithFallback,
  getUserSalt,
  getUserSessionNonce,
} from '#lib/crypto/keyDerivation';
import { deriveSessionKey } from '#lib/crypto/sessionKey';
import { toArrayBuffer } from '#lib/crypto/aesGcm';
import {
  ENVELOPE_VERSION,
  KEK_KDF_PARAMS,
  buildBundle,
  derivePrfKek,
  deriveSecretKek,
  envelopeFingerprint,
  generateDek,
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
} from '#lib/crypto/keyEnvelope';
import { fetchEnvelopes, saveEnvelopes } from '#lib/api/keyEnvelopes';
import { loginOptions } from '#lib/api/webauthn';
import { authenticate } from '#lib/webauthn/client';
import { get } from 'svelte/store';
import { sessionStore } from '#lib/stores/session';
import { safeLocalStorage, safeSessionStorage } from '#lib/utils/storage';
import { base64ToUint8Array, uint8ArrayToBase64 } from '#lib/crypto/aesGcm';

const FINGERPRINT_PREFIX = 'bg_envelope_fp:';

/** Compare credential ids ignoring base64url padding (server pads, `navigator.credentials` doesn't; a mismatch would look like "this passkey has no wrap"). */
export function sameCredential(a: string | null, b: string | null): boolean {
  if (a === null || b === null) {
    return false;
  }
  return a.replace(/=+$/, '') === b.replace(/=+$/, '');
}
const KEY_ID_STORAGE = 'bg_key_id';

/** Remember which data-key generation this session opened: a non-secret random label so records can say which key sealed them. In sessionStorage, so it dies with the keys. */
export function rememberKeyId(keyId: Uint8Array): void {
  safeSessionStorage.setItem(KEY_ID_STORAGE, uint8ArrayToBase64(keyId));
}

/** The current data-key generation, or 16 zero bytes when unknown (matches placeholder identity rows and pre-envelope clients, so it stays a valid "none recorded" marker, not an error). */
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
 * Refuse an envelope set this browser hasn't seen. A server substituting a set whose data key it knows
 * could read everything written afterwards; AAD can't catch that (server picks both sides), a pin can.
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
 * Open the vault with the password, migrating the account if it has no envelope. The migration adopts
 * the *existing* derived key as the data key (not a fresh one): all records on disk and server were
 * sealed with it, so nothing is re-encrypted and no half-converted vault exists. It is also the only
 * moment the PBKDF2 fallback and legacy keys exist, so they are captured into the bundle here or lost.
 */
export async function openWithPassword(
  teacherId: string,
  email: string,
  password: string,
  opts: { allowMigration: boolean },
): Promise<OpenedVault> {
  const existing = await fetchEnvelopes();

  if (existing === null) {
        // Migration seals whatever key this password derives as the data key, so only a password the server
        // just accepted may do it: an unverified one (vault prompt after passkey-only sign-in) would adopt a
        // wrong key and orphan every record.
    if (!opts.allowMigration) {
      throw new EnvelopeFactorMissingError('password');
    }
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
 * Rewrite a wrap that opened only under the superseded KDF (`deriveKey` once substituted PBKDF2 when
 * Argon2 WASM failed to load without recording it, so the wrap says `argon2id` but stops opening once
 * the WASM loads). Repaired on the sign-in that noticed. Best effort: the teacher already has the right
 * key, and a failed repair write must not take that away.
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
 * Re-wrap the same data key under a new password (change or reset). Issues a fresh recovery code (the
 * old one was just spent or belongs to a dead password) and returns it to be shown once. Passkey wraps
 * are carried through (see `setWithReplacedWrap`): rebuilding from two secrets deletes wraps of every
 * other factor.
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
 * Abandon the old data key and start over under the current password: the way out for a teacher whose
 * password was reset and whose recovery code is gone (the reset invalidates the password wrap, so the
 * session holds no key). IRREVERSIBLE: `keep` is empty so passkey wraps go too (they hold the *old* key;
 * passkeys still sign in but must be re-added before they open anything), and everything sealed under
 * the old key stays sealed forever. That cost must be spelled out before calling.
 */
export async function startFreshVault(
  teacherId: string,
  password: string,
): Promise<OpenedVault> {
  const keyId = generateKeyId();
  const dek = generateDek();
  const recoveryCode = generateRecoveryCode();
  const source: UnwrappedBundle = { dek, fallback: null, legacy: null };

  const set = await buildSet(teacherId, keyId, source, password, recoveryCode);
  await saveEnvelopes(set);
  await pinFingerprint(teacherId, set);
  return { ...source, keyId, newRecoveryCode: recoveryCode, migrated: false };
}

/**
 * Rebuild exactly one Argon2id wrap, carrying all others through untouched. `saveEnvelopes` replaces
 * the whole set and `buildSet` only emits wraps it has a secret for, so building a set to change one
 * factor silently deletes the others (passkeys stop opening the vault with no signal until tried).
 * The rest stay opaque ciphertext holding the same data key.
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

/** Issue a replacement recovery code from an open vault (codes are single-use and shown once, so a mislaid one must not mean data loss). */
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
 * Re-wrap the data key for an in-session password change. Returns the set instead of saving it: the
 * server writes password and key copy in one transaction, so it travels in the change-password request.
 * The recovery wrap is carried through (it can't be rebuilt without the gone code plaintext, and holds
 * the same key). Pin the returned set with `pinEnvelopeSet` once the request succeeds.
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
 * Turn an opened vault into the keys the session store holds. The session nonce stays
 * `getUserSessionNonce(email)` (HKDF salt, not a secret) because every existing record, local and
 * server, was sealed under it; since migration adopts the old derived key as DEK, the resulting
 * session key is byte-identical to the old scheme's, so nothing is re-encrypted.
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
 * Build the envelope set for a password reset, without saving it. The reset endpoint writes the new
 * password and this set in one transaction: two round trips could leave a changed password with a stale
 * key copy, which looks fine until the next sign-in opens nothing. Returns the fresh recovery code to
 * show once (the old one was just spent). Passkey wraps are carried through: rebuilding from password and
 * new code alone would drop them, leaving passkeys that sign in but open nothing, with no symptom.
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

/** Pin an envelope set this browser didn't write itself, e.g. right after a reset (uploaded inside the reset request, so known-good). */
export async function pinEnvelopeSet(teacherId: string, set: EnvelopeSet): Promise<void> {
  await pinFingerprint(teacherId, set);
}

/** Reconstruct the opened vault from the live session, which already holds the data key and decrypt chain, so adding a wrap needs no password. */
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
 * Add a passkey's PRF wrap to the existing set, after registering a PRF-capable passkey in an open
 * session. Password and recovery wraps are carried through as opaque ciphertext (re-deriving them needs
 * secrets we lack); only the new wrap is built.
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

/** The authenticator signed the assertion but returned no PRF secret. */
export class PrfUnavailableError extends Error {
  constructor() {
    super('This passkey does not provide the PRF extension.');
    this.name = 'PrfUnavailableError';
  }
}

/** Credential ids of passkeys that can open the vault now. The stored wrap is the truth, not the registration-time `supports_prf` flag (a guess some authenticators get wrong, never updated). */
export async function passkeyWrapIds(): Promise<string[]> {
  const existing = await fetchEnvelopes();
  if (existing === null) {
    return [];
  }
  return existing.envelopes
    .filter((e) => e.kind === 'passkey' && !e.invalidatedAt && e.credentialIdB64 !== null)
    .map((e) => e.credentialIdB64 as string);
}

/** Let an already-registered passkey open the vault, from an open session. Needs only the passkey (the session holds the data key); the ceremony is pinned to the credential and not sent to the server, only producing its PRF secret. */
export async function enablePasskeyUnlock(
  teacherId: string,
  credentialIdB64: string,
): Promise<void> {
  const vault = vaultFromSession();
  if (vault === null) {
    throw new EnvelopeFactorMissingError('session');
  }
  const assertion = await authenticate(await loginOptions(), { credentialIdB64 });
  const assertedId = (JSON.parse(assertion.credentialJson) as { rawId: string }).rawId;
  if (!sameCredential(assertedId, credentialIdB64)) {
    throw new Error('The browser answered with a different passkey.');
  }
  if (!assertion.prfOutput) {
    throw new PrfUnavailableError();
  }
  await addPasskeyWrap(teacherId, vault, credentialIdB64, assertion.prfOutput);
}
