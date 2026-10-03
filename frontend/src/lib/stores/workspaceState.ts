import { writable } from 'svelte/store';

/**
 * Why the current session may not open this browser's workspace (see `lib/db/workspace.ts`):
 * - `foreign-key`: the data is sealed under another vault or account key.
 * - `foreign-account`: a hybrid workspace owned by another account or backend (its local results are real data).
 * - `needs-sign-in`: a server-backed workspace opened with a local passphrase session.
 * - `pending-writes`: an all-server cache of another owner still holds unsent offline writes.
 */
export type WorkspaceBlockReason = 'foreign-key' | 'foreign-account' | 'needs-sign-in' | 'pending-writes';

export type WorkspaceStatus =
  | { state: 'unchecked' }
  | { state: 'ok' }
  | { state: 'blocked'; reason: WorkspaceBlockReason };

/** Set by `openWorkspace()`; the root layout renders a blocking screen while it is `blocked`. */
export const workspaceStatusStore = writable<WorkspaceStatus>({ state: 'unchecked' });

/**
 * Id of the workspace this tab works in, read synchronously by the offline queue. Null until the
 * manifest is loaded.
 */
export const workspaceIdStore = writable<string | null>(null);
