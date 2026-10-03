/**
 * Gated storage-mode switching: export -> wipe & switch -> import; the `.bgproj` archive is the only
 * bridge between modes. The wipe and the new mode are one IndexedDB transaction (`replaceWorkspace` in
 * `lib/db/workspace.ts`), so a failure leaves the old mode with all its data. The phase is persisted so
 * a reload after the switch resumes at the import. Strategy and invariants: docs/dev/storage_modes.md.
 */

import { get, writable } from 'svelte/store';
import { storagePolicyStore, type StorageMode } from '#lib/stores/storagePolicy';
import { safeLocalStorage } from '#lib/utils/storage';
import { currentManifest, replaceWorkspace, workspaceIsEmpty } from '#lib/db/workspace';
import { projectStore } from '#lib/stores/project';
import { pendingWritesCount } from '#lib/services/offlineQueue';
import { api } from '#lib/api/client';

export const PENDING_KEY = 'bg_pending_mode_switch';

/** confirm → export → exported → switching → reimport; cleared when done. */
export type SwitchPhase = 'confirm' | 'export' | 'exported' | 'switching' | 'reimport';

export interface PendingModeSwitch {
  from: StorageMode;
  to: StorageMode;
  phase: SwitchPhase;
  archiveFilename: string | null;
}

function readPending(): PendingModeSwitch | null {
  try {
    return JSON.parse(safeLocalStorage.getItem(PENDING_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export const pendingSwitchStore = writable<PendingModeSwitch | null>(readPending());
pendingSwitchStore.subscribe((value) => {
  if (value) safeLocalStorage.setItem(PENDING_KEY, JSON.stringify(value));
  else safeLocalStorage.removeItem(PENDING_KEY);
});

/** True in the tab driving the switch; other tabs show a blocking overlay instead (`workspaceSync.ts`). */
export const switchOwnedHere = writable(false);

function update(patch: Partial<PendingModeSwitch>): void {
  const pending = get(pendingSwitchStore);
  if (pending) pendingSwitchStore.set({ ...pending, ...patch });
}

/** True when there is nothing a switch could lose, so the export may be skipped. Counts every data table. */
export const localWorkspaceIsEmpty = workspaceIsEmpty;

/**
 * Starts a switch. Refused while the current workspace still has writes waiting for the server: they
 * would be dropped with the workspace (I7). @throws with a message for the wizard.
 */
export function beginModeSwitch(to: StorageMode): void {
  if (get(pendingWritesCount) > 0) {
    throw new PendingWritesError();
  }
  pendingSwitchStore.set({
    from: get(storagePolicyStore).storageMode,
    to,
    phase: 'confirm',
    archiveFilename: null,
  });
  switchOwnedHere.set(true);
}

export class PendingWritesError extends Error {
  constructor() {
    super('The workspace still has changes waiting for the server.');
    this.name = 'PendingWritesError';
  }
}

export const requireExport = () => update({ phase: 'export' });

/** Records the export (or an explicit skip), which unlocks the wipe. */
export const markExported = (archiveFilename: string | null = null) =>
  update({ phase: 'exported', archiveFilename });

/**
 * Replaces the workspace with an empty one in the target mode, atomically. Server rows are never touched
 * here (the archive is the portable copy; `purgeServerStudentData` is offered afterwards). On failure
 * the phase returns to `exported` and the old workspace is intact.
 */
export async function commitModeSwitch(): Promise<void> {
  const pending = get(pendingSwitchStore);
  if (pending?.phase !== 'exported') {
    throw new Error('Refusing to switch storage modes before the workspace has been exported.');
  }
  if (get(pendingWritesCount) > 0) throw new PendingWritesError();
  update({ phase: 'switching' });
  try {
    await replaceWorkspace(pending.to, { explicit: true });
  } catch (err) {
    update({ phase: 'exported' });
    throw err;
  }
  projectStore.clear();
  update({ phase: 'reimport' });
}

export function finishModeSwitch(): void {
  switchOwnedHere.set(false);
  pendingSwitchStore.set(null);
}

/** Abandons a switch; refused once the workspace has been replaced. */
export function abortModeSwitch(): boolean {
  const phase = get(pendingSwitchStore)?.phase;
  if (phase === 'switching' || phase === 'reimport') return false;
  finishModeSwitch();
  return true;
}

/**
 * Picks up a switch a reload interrupted. `switching` means the page died around the transaction: the
 * manifest tells whether it committed (continue at the import) or not (back to the wipe step).
 */
export async function resumeModeSwitch(): Promise<void> {
  const pending = get(pendingSwitchStore);
  if (!pending) return;
  switchOwnedHere.set(true);
  if (pending.phase === 'switching') {
    const manifest = await currentManifest();
    update({ phase: manifest?.mode === pending.to ? 'reimport' : 'exported' });
  }
}

/** True when leaving `from` for `to` takes student data off the server, so its server copy may be deleted. */
export function switchLeavesServerStudentData(from: StorageMode, to: StorageMode): boolean {
  return from === 'all-server' && to !== 'all-server';
}

/**
 * Soft-deletes the account's student identities and scan submissions on the server (7-day grace period,
 * `POST /user/purge-server-student-data`). Offered, not forced, after a switch away from `all-server`.
 */
export async function purgeServerStudentData(): Promise<{ students: number; submissions: number }> {
  const res = (await api.post('/user/purge-server-student-data', undefined, { silentError: true })) as {
    purged_student_identities: number;
    purged_submissions: number;
  };
  return { students: res.purged_student_identities, submissions: res.purged_submissions };
}
