/** Records that failed to decrypt this session, for the layout's persistent warning banner. */

import { writable } from 'svelte/store';

export interface VaultIntegrityState {
  kinds: string[];
  count: number;
}

const INITIAL: VaultIntegrityState = { kinds: [], count: 0 };

function createVaultIntegrityStore() {
  const { subscribe, update, set } = writable<VaultIntegrityState>(INITIAL);
  return {
    subscribe,
    report(kind: string) {
      update(({ kinds, count }) => ({
        kinds: kinds.includes(kind) ? kinds : [...kinds, kind],
        count: count + 1,
      }));
    },
    reset: () => set(INITIAL),
  };
}

export const vaultIntegrityStore = createVaultIntegrityStore();
