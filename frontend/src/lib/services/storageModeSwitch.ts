/**
 * Gated storage-mode switching.
 *
 * Changing the storage mode changes which store every repository talks to, and
 * the data does not follow. The old handler was
 * `confirm()` → `wipeDatabase()` → set mode → reload: it destroyed every local
 * exam, exercise, submission, scan, score and MC group without uploading any of
 * it, and nothing checked whether the destination already held equivalent data.
 *
 * Switching now runs through here: export the workspace to an archive, then
 * wipe, then switch, then offer to import that archive in the new mode. The
 * archive is the only bridge between modes, which is the deliberate design —
 * see the decision recorded in docs/data_flow_and_security.md §5.
 *
 * The phase is persisted, because the wipe is irreversible and a reload halfway
 * through used to leave a workspace that looked empty for no stated reason.
 */

import { get, writable } from 'svelte/store';
import {
  armStorageModeSwitch,
  disarmStorageModeSwitch,
  storagePolicyStore,
  type StorageMode,
} from '$lib/stores/storagePolicy';
import { safeLocalStorage } from '$lib/utils/storage';
import { wipeDatabase } from '$lib/db/hygiene';
import { projectStore } from '$lib/stores/project';
import { db } from '$lib/db/db';

const PENDING_KEY = 'bg_pending_mode_switch';

export type SwitchPhase =
  | 'idle'
  /** Explaining what is about to happen; nothing has changed yet. */
  | 'confirm'
  /** Waiting for the export that is the precondition for the wipe. */
  | 'export'
  /** Export done; the wipe and mode change may proceed. */
  | 'exported'
  /** Wiping and switching. */
  | 'switching'
  /** Switched; offering to import the archive into the new mode. */
  | 'reimport'
  | 'done';

export interface PendingModeSwitch {
  from: StorageMode;
  to: StorageMode;
  phase: SwitchPhase;
  startedAt: string;
  exportedAt: string | null;
  archiveFilename: string | null;
  token: string;
}

function readPending(): PendingModeSwitch | null {
  const raw = safeLocalStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingModeSwitch;
    return parsed && parsed.to && parsed.phase ? parsed : null;
  } catch {
    return null;
  }
}

function createPendingStore() {
  const { subscribe, set } = writable<PendingModeSwitch | null>(readPending());
  return {
    subscribe,
    set(value: PendingModeSwitch | null) {
      if (value) {
        safeLocalStorage.setItem(PENDING_KEY, JSON.stringify(value));
      } else {
        safeLocalStorage.removeItem(PENDING_KEY);
      }
      set(value);
    },
  };
}

/**
 * The switch in progress, if any. Persisted, so the root layout can resume it
 * after a reload rather than leaving the teacher in a half-migrated workspace.
 */
export const pendingSwitchStore = createPendingStore();

/** True while a gated switch is underway. */
export function isSwitchInProgress(): boolean {
  const pending = get(pendingSwitchStore);
  return !!pending && pending.phase !== 'idle' && pending.phase !== 'done';
}

/**
 * Counts what a switch would leave behind.
 *
 * Only an empty workspace may skip the export step, and "empty" has to mean
 * empty in the *current* mode — which for `all-server` is a question about the
 * server, not about the local cache that a lock may just have wiped. Counting
 * the local tables is therefore the wrong test on its own; callers pass the
 * counts they already loaded where they have them.
 */
export async function localWorkspaceIsEmpty(): Promise<boolean> {
  if (!db.exams) return true;
  const counts = await Promise.all([
    db.exams.count(),
    db.exercises.count(),
    db.students.count(),
    db.submissions.count(),
    db.exerciseScores.count(),
  ]);
  return counts.every((n) => n === 0);
}

/** Opens a gated switch. Nothing is changed yet. */
export function beginModeSwitch(to: StorageMode): PendingModeSwitch {
  const from = get(storagePolicyStore).storageMode;
  const pending: PendingModeSwitch = {
    from,
    to,
    phase: 'confirm',
    startedAt: new Date().toISOString(),
    exportedAt: null,
    archiveFilename: null,
    token: armStorageModeSwitch(),
  };
  pendingSwitchStore.set(pending);
  return pending;
}

/** Advance to the export step. */
export function requireExport(): void {
  const pending = get(pendingSwitchStore);
  if (!pending) return;
  pendingSwitchStore.set({ ...pending, phase: 'export' });
}

/** Records that the archive was written, which unlocks the wipe. */
export function markExported(archiveFilename: string): void {
  const pending = get(pendingSwitchStore);
  if (!pending) return;
  pendingSwitchStore.set({
    ...pending,
    phase: 'exported',
    exportedAt: new Date().toISOString(),
    archiveFilename,
  });
}

/**
 * Records that the teacher asserted they already hold a current archive, or
 * that there is nothing to export. Deliberately a separate call from
 * `markExported` so the distinction survives into the resume banner.
 */
export function markExportSkipped(): void {
  const pending = get(pendingSwitchStore);
  if (!pending) return;
  pendingSwitchStore.set({ ...pending, phase: 'exported', exportedAt: null });
}

/**
 * Wipes the local database and switches the mode, in that order.
 *
 * Only the *local* store is wiped. Server rows are never deleted by a mode
 * switch: the teacher's account keeps its exams, and the archive is the
 * portable copy. Refuses unless an export has been recorded.
 */
export async function commitModeSwitch(): Promise<void> {
  const pending = get(pendingSwitchStore);
  if (!pending) throw new Error('No storage-mode switch is in progress.');
  if (pending.phase !== 'exported') {
    throw new Error('Refusing to switch storage modes before the workspace has been exported.');
  }

  pendingSwitchStore.set({ ...pending, phase: 'switching' });

  // Mode first, then the wipe: if the wipe fails, the repositories are already
  // pointing at the new store and the stale local rows are unreachable rather
  // than half-read. The reverse order can leave the app reading an emptied
  // local store while still configured for it.
  storagePolicyStore.commitStorageMode(pending.to, pending.token);
  await wipeDatabase();
  projectStore.clear();

  pendingSwitchStore.set({ ...get(pendingSwitchStore)!, phase: 'reimport' });
}

/** Ends the switch. Called after the import step, or when it is declined. */
export function finishModeSwitch(): void {
  disarmStorageModeSwitch();
  pendingSwitchStore.set(null);
}

/**
 * Abandons a switch. Only legal before the wipe — afterwards the local store is
 * already gone and going back would present an empty workspace as intact.
 */
export function abortModeSwitch(): boolean {
  const pending = get(pendingSwitchStore);
  if (!pending) return true;
  if (pending.phase === 'switching' || pending.phase === 'reimport') return false;
  disarmStorageModeSwitch();
  pendingSwitchStore.set(null);
  return true;
}

/**
 * Re-arms a switch that a reload interrupted, so the wizard can continue.
 * The token does not survive a reload — it is module state — so it is minted
 * again here and written back into the persisted record.
 */
export function resumeModeSwitch(): PendingModeSwitch | null {
  const pending = get(pendingSwitchStore);
  if (!pending || pending.phase === 'done') return null;
  const resumed = { ...pending, token: armStorageModeSwitch() };
  pendingSwitchStore.set(resumed);
  return resumed;
}
