/**
 * Refuses writes that would replace real data with blanks: a record that failed
 * to decrypt is marked, and every `encryptX()` calls `assertEncryptable()` first.
 * The marker is a plain field so it survives `{ ...record }`.
 */

import { vaultIntegrityStore } from '$lib/stores/vaultIntegrity';

/** `'error'`: would not open (wrong key, corruption), reported. `'locked'`: no key yet, silent. */
export type DecryptFailureReason = 'error' | 'locked';

export interface MaybeUndecryptable {
  /** Set by `decryptX()`; never persisted, because `assertEncryptable` throws first. */
  decryptFailed?: DecryptFailureReason;
}

export class DecryptFailedError extends Error {
  constructor(kind: string) {
    super(`Refusing to write a ${kind} record whose payload was never decrypted.`);
    this.name = 'DecryptFailedError';
  }
}

export class MissingSessionKeyError extends Error {
  constructor(kind: string) {
    super(`Refusing to write a ${kind} record without a session key.`);
    this.name = 'MissingSessionKeyError';
  }
}

export function markDecryptFailed<T extends MaybeUndecryptable>(
  record: T,
  kind: string,
  reason: DecryptFailureReason = 'error'
): T {
  if (reason === 'error') vaultIntegrityStore.report(kind);
  return { ...record, decryptFailed: reason };
}

/** Call first in every encryptor. */
export function assertEncryptable(
  record: MaybeUndecryptable,
  key: CryptoKey | null,
  kind: string
): asserts key is CryptoKey {
  if (record.decryptFailed) throw new DecryptFailedError(kind);
  if (!key) throw new MissingSessionKeyError(kind);
}
