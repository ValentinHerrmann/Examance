/**
 * Cross-tab coherence for the workspace (I6, docs/dev/storage_modes.md): a tab holding the previous mode would route to the
 * old store and mirror server rows into a database that moved on, so any workspace change reloads every other tab and a
 * results move blocks them. `storage` events fire only in the *other* tabs, which is exactly the audience.
 */

import { derived, writable } from 'svelte/store';
import { WORKSPACE_ID_KEY } from '#lib/db/workspace';
import { MODE_CHANGED_KEY, PENDING_KEY, switchOwnedHere } from '#lib/services/storageModeSwitch';

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
  // Only a move that starts while this tab is open blocks it. A record already present at load is
  // an interrupted move; the layout offers to run it again instead of blocking forever.

  window.addEventListener('storage', (event) => {
    const changed = event.newValue !== event.oldValue;
    if ((event.key === WORKSPACE_ID_KEY || event.key === MODE_CHANGED_KEY) && changed) {
      // Another tab replaced the workspace or changed the account's mode: nothing in this tab's memory
      // is valid any more.
      window.location.reload();
      return;
    }
    if (event.key === PENDING_KEY) {
      switchPending.set(event.newValue !== null);
    }
  });
}
