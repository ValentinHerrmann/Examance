/**
 * Gated storage-mode switching: export → wipe → switch → import. The `.bgproj`
 * archive is the only bridge between modes. This service holds the one token
 * `commitStorageMode` accepts and uses it only after an export was recorded;
 * the phase is persisted so a reload after the wipe resumes the switch.
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

/** confirm → export → exported → switching → reimport; cleared when done. */
export type SwitchPhase = 'confirm' | 'export' | 'exported' | 'switching' | 'reimport';

export interface PendingModeSwitch {
  from: StorageMode;
  to: StorageMode;
  phase: SwitchPhase;
  archiveFilename: string | null;
  token: string;
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

function update(patch: Partial<PendingModeSwitch>): void {
  const pending = get(pendingSwitchStore);
  if (pending) pendingSwitchStore.set({ ...pending, ...patch });
}

/** True when there is nothing a switch could lose, so the export may be skipped. */
export async function localWorkspaceIsEmpty(): Promise<boolean> {
  if (!db.exams) return true;
  const tables = [db.exams, db.exercises, db.students, db.submissions, db.exerciseScores];
  const counts = await Promise.all(tables.map((t) => t.count()));
  return counts.every((n) => n === 0);
}

/**
 * Called on server sign-in. A browser with an empty local workspace has nothing
 * the gate could protect, so it adopts server storage directly instead of
 * showing the account an empty local vault. Any local data keeps the mode as is.
 *
 * @returns true when the mode changed.
 */
export async function adoptServerStorageIfLocalEmpty(): Promise<boolean> {
  if (get(storagePolicyStore).storageMode !== 'all-local' || get(pendingSwitchStore)) return false;
  if (!(await localWorkspaceIsEmpty())) return false;
  try {
    storagePolicyStore.commitStorageMode('all-server', armStorageModeSwitch());
  } finally {
    disarmStorageModeSwitch();
  }
  return true;
}

export function beginModeSwitch(to: StorageMode): void {
  pendingSwitchStore.set({
    from: get(storagePolicyStore).storageMode,
    to,
    phase: 'confirm',
    archiveFilename: null,
    token: armStorageModeSwitch(),
  });
}

export const requireExport = () => update({ phase: 'export' });

/** Records the export (or an explicit skip), which unlocks the wipe. */
export const markExported = (archiveFilename: string | null = null) =>
  update({ phase: 'exported', archiveFilename });

/**
 * Switches the mode, then wipes the local store. Server rows are never touched
 * — the account keeps its data and the archive is the portable copy. Mode first:
 * if the wipe fails, the repositories already point at the new store.
 */
export async function commitModeSwitch(): Promise<void> {
  const pending = get(pendingSwitchStore);
  if (pending?.phase !== 'exported') {
    throw new Error('Refusing to switch storage modes before the workspace has been exported.');
  }
  update({ phase: 'switching' });
  storagePolicyStore.commitStorageMode(pending.to, pending.token);
  await wipeDatabase();
  projectStore.clear();
  update({ phase: 'reimport' });
}

export function finishModeSwitch(): void {
  disarmStorageModeSwitch();
  pendingSwitchStore.set(null);
}

/** Abandons a switch; refused once the wipe has run. */
export function abortModeSwitch(): boolean {
  const phase = get(pendingSwitchStore)?.phase;
  if (phase === 'switching' || phase === 'reimport') return false;
  finishModeSwitch();
  return true;
}

/** Re-arms a switch a reload interrupted — the token is module state. */
export function resumeModeSwitch(): void {
  if (get(pendingSwitchStore)) update({ token: armStorageModeSwitch() });
}
