/**
 * Vault integrity — "a record would not decrypt" reporting.
 *
 * A failed decryption used to be invisible: `dbEncryption.ts` logged to the
 * console and handed the caller a record with every payload field `undefined`,
 * which renders exactly like an empty exam. Saving that record then re-sealed
 * the blank payload over the real one, so a transient key problem turned into
 * permanent data loss with no error anywhere.
 *
 * Decryption now marks the record instead (`decryptFailed`), every encrypt path
 * refuses to write a marked record, and the failure is reported here so the
 * layout can put one persistent banner on screen. It is deliberately a banner
 * rather than a toast or the HTTP error modal: the condition is not transient
 * and not an HTTP fault, and the user needs to know *before* they keep working
 * that what they are looking at is not their data.
 */

import { writable, derived } from 'svelte/store';

/** Which record kinds failed to decrypt, and how many records in total. */
export interface VaultIntegrityState {
  /** Record kinds ("exam", "submission", …) that produced at least one failure. */
  kinds: string[];
  /** Total number of records that failed to decrypt this session. */
  count: number;
}

const INITIAL_STATE: VaultIntegrityState = { kinds: [], count: 0 };

function createVaultIntegrityStore() {
  const { subscribe, update, set } = writable<VaultIntegrityState>(INITIAL_STATE);

  return {
    subscribe,

    /**
     * Record one failed decryption. Called from `dbEncryption.ts` per record, so
     * it must stay cheap and must not surface one dialog per row.
     */
    report(kind: string) {
      update((state) => ({
        kinds: state.kinds.includes(kind) ? state.kinds : [...state.kinds, kind],
        count: state.count + 1,
      }));
    },

    /** Clear the banner — on unlock with a different key, or on user dismissal. */
    reset() {
      set(INITIAL_STATE);
    },
  };
}

export const vaultIntegrityStore = createVaultIntegrityStore();

/** True while at least one record has failed to decrypt in this session. */
export const hasVaultIntegrityFailure = derived(
  vaultIntegrityStore,
  ($state) => $state.count > 0
);
