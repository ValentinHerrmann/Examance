/**
 * Cross-tab coordination for a storage-mode change. The move itself is `services/resultsMover.ts`; this
 * module only records that one is running (so other tabs block, `stores/workspaceSync.ts`) and in
 * which tab. Strategy: docs/dev/storage_modes.md.
 */

import { get, writable } from 'svelte/store';
import type { StorageMode } from '#lib/stores/storagePolicy';
import { safeLocalStorage } from '#lib/utils/storage';
import { pendingWritesCount } from '#lib/services/offlineQueue';

export const PENDING_KEY = 'bg_pending_mode_switch';
/** Bumped after the account's mode changed; other tabs reload on it (`stores/workspaceSync.ts`). */
export const MODE_CHANGED_KEY = 'bg_mode_changed';

/** Tells the other tabs of this browser that the account's mode changed. */
export function announceModeChange(): void {
  safeLocalStorage.setItem(MODE_CHANGED_KEY, new Date().toISOString());
}

export interface PendingModeSwitch {
  /** Null for the account's first choice. */
  from: StorageMode | null;
  to: StorageMode;
  startedAt: string;
}

function readPending(): PendingModeSwitch | null {
  try {
    const value = JSON.parse(safeLocalStorage.getItem(PENDING_KEY) ?? 'null');
    // Records of the old export/wipe/import switch carry a `phase`; they mean nothing any more.
    return value && !('phase' in value) ? value : null;
  } catch {
    return null;
  }
}

export const pendingSwitchStore = writable<PendingModeSwitch | null>(readPending());
pendingSwitchStore.subscribe((value) => {
  if (value) safeLocalStorage.setItem(PENDING_KEY, JSON.stringify(value));
  else safeLocalStorage.removeItem(PENDING_KEY);
});

/** True in the tab driving the move; other tabs show a blocking overlay instead (`workspaceSync.ts`). */
export const switchOwnedHere = writable(false);

export class PendingWritesError extends Error {
  constructor() {
    super('The workspace still has changes waiting for the server.');
    this.name = 'PendingWritesError';
  }
}

/** Claims the move for this tab. Refused while writes still wait for the server: they would race the move. */
export function beginModeSwitch(from: StorageMode | null, to: StorageMode): void {
  if (get(pendingWritesCount) > 0) throw new PendingWritesError();
  pendingSwitchStore.set({ from, to, startedAt: new Date().toISOString() });
  switchOwnedHere.set(true);
}

export function finishModeSwitch(): void {
  switchOwnedHere.set(false);
  pendingSwitchStore.set(null);
}

/**
 * A move a reload interrupted is simply run again: every step is an idempotent upsert, and the
 * account's mode only changes once the results have arrived.
 */
export function interruptedSwitch(): PendingModeSwitch | null {
  return get(pendingSwitchStore);
}
