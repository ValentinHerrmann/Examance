/**
 * The guard that turns "this record would not decrypt" from silent data loss
 * into a refusal.
 *
 * Every `decryptX()` in `dbEncryption.ts` used to swallow its error and return
 * the base record — id and index columns present, every encrypted field
 * `undefined`. That is indistinguishable from an empty record, so the UI showed
 * blanks, and the next `encryptX()` + `put` sealed those blanks over the real
 * payload. One wrong key destroyed the vault without raising anything.
 *
 * Now a failed decryption marks the record, and every encrypt path calls
 * `assertEncryptable()` first. A marked record cannot be written back, so the
 * worst case is a read that shows nothing and a save that fails loudly — never a
 * save that succeeds at overwriting real data with nothing.
 *
 * The marker is a plain enumerable property on purpose: records are spread
 * (`{ ...exam, title }`) all over the app, and a non-enumerable flag or a
 * WeakSet would be dropped by the first spread, letting the copy be written.
 */

import { vaultIntegrityStore } from '$lib/stores/vaultIntegrity';

/**
 * Why a record came back from `decryptX()` without its payload.
 *
 * - `'error'` — the ciphertext was there and would not open. Wrong key, or
 *   corruption. Reported to the user; the banner exists for this case.
 * - `'locked'` — there was a payload but no key to open it, because the session
 *   is locked. Expected, not worth a banner, and just as unsafe to write back:
 *   the blanks would replace the real values exactly the same way.
 */
export type DecryptFailureReason = 'error' | 'locked';

/** A record that came back from `decryptX()` without its payload. */
export interface MaybeUndecryptable {
  /**
   * Set by `decryptX()` when the payload ciphertext was not opened.
   * Never persisted — `assertEncryptable()` refuses the write first.
   */
  decryptFailed?: DecryptFailureReason;
}

/** Thrown when something tries to persist a record whose payload never opened. */
export class DecryptFailedError extends Error {
  constructor(
    public readonly kind: string,
    public readonly reason: DecryptFailureReason = 'error'
  ) {
    super(
      `Refusing to write a ${kind} record whose encrypted payload was never ` +
        (reason === 'locked' ? 'unlocked' : 'readable') +
        `. Saving it would replace the stored data with blanks. Unlock the ` +
        `session with the correct key and try again.`
    );
    this.name = 'DecryptFailedError';
  }
}

/** Thrown when an encrypt path is reached with no session key. */
export class MissingSessionKeyError extends Error {
  constructor(public readonly kind: string) {
    super(
      `Refusing to write a ${kind} record without a session key. The record ` +
        `would be stored in plaintext next to its stale ciphertext, and the ` +
        `stale ciphertext would win on the next read.`
    );
    this.name = 'MissingSessionKeyError';
  }
}

/**
 * Marks a record as undecryptable. Returns the record so callers can
 * `return markDecryptFailed(base, 'exam')`.
 *
 * Only `'error'` reaches the banner — a locked session producing empty records
 * is the documented behaviour, not a fault to report.
 */
export function markDecryptFailed<T extends MaybeUndecryptable>(
  record: T,
  kind: string,
  reason: DecryptFailureReason = 'error'
): T {
  if (reason === 'error') {
    vaultIntegrityStore.report(kind);
  }
  return { ...record, decryptFailed: reason };
}

/** True when this record came out of a failed decryption. */
export function isDecryptFailed(record: MaybeUndecryptable | null | undefined): boolean {
  return !!record?.decryptFailed;
}

/**
 * Strips the marker so a record rebuilt from scratch (an import, a fresh
 * create) can be written even though it was derived from one that could not be
 * read. Callers must be certain the payload fields are real.
 */
export function clearDecryptFailed<T extends MaybeUndecryptable>(record: T): T {
  const { decryptFailed: _dropped, ...rest } = record;
  return rest as T;
}

/**
 * Call at the top of every `encryptX()`. Throws rather than let a blank payload
 * or a keyless write reach storage.
 */
export function assertEncryptable(
  record: MaybeUndecryptable,
  key: CryptoKey | null,
  kind: string
): asserts key is CryptoKey {
  if (record.decryptFailed) {
    throw new DecryptFailedError(kind, record.decryptFailed);
  }
  if (!key) {
    throw new MissingSessionKeyError(kind);
  }
}
