/**
 * Cross-tab coherence for the workspace (I6, docs/dev/storage_modes.md). A tab holding the previous mode
 * in memory keeps routing to the old store and mirroring server rows into a database that has moved on,
 * so any change of the workspace reloads every other tab, and a switch in progress blocks them.
 * `storage` events fire only in the *other* tabs of the origin, which is exactly the audience.
 */

import { derived, writable } from 'svelte/store';
import { WORKSPACE_ID_KEY } from '#lib/db/workspace';
import { PENDING_KEY, switchOwnedHere } from '#lib/services/storageModeSwitch';
import { safeLocalStorage } from '#lib/utils/storage';

/** A switch is pending somewhere (this tab's own store is not told about other tabs' writes). */
const switchPending = writable(false);

/** True while another tab is running a storage-mode switch; the layout shows a blocking overlay. */
export const switchRunningElsewhere = derived(
  [switchPending, switchOwnedHere],
  ([$pending, $owned]) => $pending && !$owned
);

let registered = false;

/** Call once from the root layout. */
export function registerWorkspaceSync(): void {
  if (registered || typeof window === 'undefined') return;
  registered = true;
  switchPending.set(safeLocalStorage.getItem(PENDING_KEY) !== null);

  window.addEventListener('storage', (event) => {
    if (event.key === WORKSPACE_ID_KEY && event.newValue !== event.oldValue) {
      // Another tab replaced or re-claimed the workspace: nothing in this tab's memory is valid any more.
      window.location.reload();
      return;
    }
    if (event.key === PENDING_KEY) {
      switchPending.set(event.newValue !== null);
    }
  });
}
