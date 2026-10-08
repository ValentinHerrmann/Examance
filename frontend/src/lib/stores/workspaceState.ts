import { writable } from 'svelte/store';

/**
 * Why the current session may not open this browser's workspace (see `lib/db/workspace.ts`):
 * - `foreign-key`: the data is sealed under another account's key.
 * - `foreign-account`: local results that belong to another account or backend.
 * - `pending-writes`: another account's offline writes are still waiting for the server.
 * - `legacy-local`: data from the discontinued local mode, which can no longer be opened.
 */
export type WorkspaceBlockReason = 'foreign-key' | 'foreign-account' | 'pending-writes' | 'legacy-local';

export type WorkspaceStatus =
  | { state: 'unchecked' }
  | { state: 'ok' }
  /** The account has not chosen a storage mode (or its mode is no longer allowed): show the choice. */
  | { state: 'needs-choice' }
  /** An admin account: it holds no exams or results, so this browser's workspace is never opened (issue #58). */
  | { state: 'admin' }
  | { state: 'blocked'; reason: WorkspaceBlockReason };

/** Set by `openWorkspace()`; the root layout renders a blocking screen or the mode choice from it. */
export const workspaceStatusStore = writable<WorkspaceStatus>({ state: 'unchecked' });

/**
 * Id of the workspace this tab works in, read synchronously by the offline queue. Null until the
 * manifest is loaded.
 */
export const workspaceIdStore = writable<string | null>(null);
