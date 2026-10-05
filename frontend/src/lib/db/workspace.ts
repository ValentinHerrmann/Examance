/**
 * The workspace manifest: one row in IndexedDB stating whose key sealed the data beside it and the
 * last storage mode the account had in this browser. Invariants (docs/dev/storage_modes.md):
 * - The account's storage mode lives on the server and every browser follows it. There is no default
 *   and nothing sets it implicitly; until the account chooses, the app shows the choice
 *   (`needs-choice`). The manifest's copy only serves offline loads.
 * - A session opens the workspace only if it owns it: the canary must decrypt under its key, and the
 *   workspace must belong to the signed-in account on the same backend.
 * - Resetting the workspace is one transaction: every data table is cleared and the new manifest
 *   written together.
 * - A workspace from the discontinued local mode is never opened; it can only be deleted.
 */

import { get } from 'svelte/store';
import { db, vaultTables } from './db';
import type { WorkspaceManifestRecord, WorkspaceOwner } from './schema';
import { decrypt, encrypt } from '#lib/crypto/aesGcm';
import { backendStore } from '#lib/stores/backendStore';
import { hasLegacyLocalVault, removeLegacyLocalVault, sessionStore } from '#lib/stores/session';
import {
  armStorageModeSwitch,
  disarmStorageModeSwitch,
  legacyCachedMode,
  storagePolicyStore,
  type StorageMode,
} from '#lib/stores/storagePolicy';
import { allowedModesFrom, capabilitiesStore, loadCapabilities } from '#lib/stores/capabilities';
import { workspaceIdStore, workspaceStatusStore, type WorkspaceStatus } from '#lib/stores/workspaceState';
import { clearOfflineQueue, hasQueuedWrites, stampUnboundQueueEntries } from '#lib/services/offlineQueue';
import { safeLocalStorage } from '#lib/utils/storage';

/** Mirror of the current workspace id in localStorage: other tabs reload when it changes (`workspaceSync.ts`). */
export const WORKSPACE_ID_KEY = 'bg_workspace_id';

const CANARY_TEXT = 'examance-workspace-canary-v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type ManifestMode = WorkspaceManifestRecord['mode'];

/** Publishes the account's mode to the store every repository routes by. */
export function applyMode(mode: StorageMode | null): void {
  if (get(storagePolicyStore).storageMode === mode) return;
  try {
    storagePolicyStore.commitStorageMode(mode, armStorageModeSwitch());
  } finally {
    disarmStorageModeSwitch();
  }
}

function publishId(manifest: WorkspaceManifestRecord): void {
  workspaceIdStore.set(manifest.workspaceId);
  if (safeLocalStorage.getItem(WORKSPACE_ID_KEY) !== manifest.workspaceId) {
    safeLocalStorage.setItem(WORKSPACE_ID_KEY, manifest.workspaceId);
  }
}

function newManifest(mode: ManifestMode): WorkspaceManifestRecord {
  return {
    id: 'current',
    workspaceId: crypto.randomUUID(),
    mode,
    owner: null,
    canaryCt: null,
    canaryIv: null,
    createdAt: new Date().toISOString(),
  };
}

/** True when no data table holds a row; the manifest itself does not count. */
export async function workspaceIsEmpty(): Promise<boolean> {
  if (!db.exams) return true;
  const counts = await Promise.all(vaultTables().map((t) => t.count()));
  return counts.every((n) => n === 0);
}

/** Students, submissions and scores held in this browser (what `hybrid` keeps local). */
export async function localResultCount(): Promise<number> {
  if (!db.students) return 0;
  const counts = await Promise.all([db.students.count(), db.submissions.count(), db.exerciseScores.count()]);
  return counts.reduce((a, b) => a + b, 0);
}

/**
 * Loads the manifest, creating it on first use. A browser from before the manifest gets the mode it
 * had cached, so legacy local data is recognised (`'all-local'`, the old default) and a former
 * hybrid browser keeps knowing that its results are real data.
 */
export async function loadWorkspace(): Promise<WorkspaceManifestRecord> {
  if (!db.isOpen()) await db.open();
  const empty = await workspaceIsEmpty();
  const manifest = await db.transaction('rw', db.workspace, async () => {
    const existing = await db.workspace.get('current');
    if (existing) return existing;
    const legacy = legacyCachedMode();
    // Only data makes a cached mode matter: an empty browser has nothing to protect.
    const fresh = newManifest(empty ? null : legacy);
    await db.workspace.put(fresh);
    return fresh;
  });
  publishId(manifest);
  return manifest;
}

/**
 * Replaces the whole workspace with an empty one (one transaction: data tables and manifest change
 * together, so a failure leaves everything as it was). Clears the offline queue, whose writes belong
 * to a workspace that no longer exists, and claims the new workspace for the current session.
 * @throws when IndexedDB refuses; nothing has changed then.
 */
export async function replaceWorkspace(mode: StorageMode | null): Promise<WorkspaceManifestRecord> {
  if (!db.isOpen()) await db.open();
  const manifest = newManifest(mode);
  const tables = [...vaultTables(), db.workspace];
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
    await db.workspace.put(manifest);
  });
  const { clearCompileCache } = await import('#lib/latex/compileCache');
  clearCompileCache();
  clearOfflineQueue();
  publishId(manifest);
  if (get(sessionStore).sessionKey) return claim(manifest);
  return manifest;
}

/** Stores the account's mode as this browser's offline copy. */
export async function rememberMode(mode: StorageMode): Promise<void> {
  if (!db.isOpen()) await db.open();
  await db.workspace.update('current', { mode });
}

function sessionIdentity(): WorkspaceOwner {
  const s = get(sessionStore);
  return {
    kind: 'account',
    accountId: s.teacherId ?? s.email,
    backendOrigin: get(backendStore) || null,
    accountEmail: s.email,
  };
}

async function claim(manifest: WorkspaceManifestRecord): Promise<WorkspaceManifestRecord> {
  const key = get(sessionStore).sessionKey;
  if (!key) throw new Error('Cannot claim the workspace without a session key.');
  const { ciphertext, iv } = await encrypt(key, encoder.encode(CANARY_TEXT));
  const claimed: WorkspaceManifestRecord = {
    ...manifest,
    owner: sessionIdentity(),
    canaryCt: ciphertext,
    canaryIv: iv,
  };
  await db.workspace.put(claimed);
  return claimed;
}

async function canaryOpens(manifest: WorkspaceManifestRecord): Promise<boolean> {
  if (!manifest.canaryCt || !manifest.canaryIv) return false;
  try {
    const plain = await decrypt(get(sessionStore).sessionKey, manifest.canaryCt, manifest.canaryIv);
    return decoder.decode(plain) === CANARY_TEXT;
  } catch {
    return false;
  }
}

/** Unclaimed legacy workspace: true when its first sealed record opens with the session key (or there is none). */
async function existingDataOpens(): Promise<boolean> {
  const key = get(sessionStore).sessionKey;
  for (const table of vaultTables()) {
    const sealed = await table
      .filter((r: { payloadCt?: Uint8Array; payloadIv?: Uint8Array }) => !!r.payloadCt && !!r.payloadIv)
      .first();
    if (!sealed) continue;
    try {
      await decrypt(key, sealed.payloadCt, sealed.payloadIv);
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

function sameAccount(a: WorkspaceOwner | null, b: WorkspaceOwner): boolean {
  if (!a) return false;
  // A tab restored before teacherId was shared across tabs may only know the e-mail; either matches.
  const sameId = a.accountId === b.accountId || (!!a.accountEmail && a.accountEmail === b.accountEmail);
  return sameId && a.backendOrigin === b.backendOrigin;
}

function isLegacyLocal(manifest: WorkspaceManifestRecord): boolean {
  return manifest.mode === 'all-local' || manifest.owner?.kind === 'local-vault';
}

/** Owner binding: may this session open this browser's data? Takes over what holds nothing worth keeping. */
async function checkOwner(manifest: WorkspaceManifestRecord): Promise<WorkspaceStatus> {
  const empty = await workspaceIsEmpty();
  const pendingWrites = hasQueuedWrites(manifest.workspaceId);

  if (isLegacyLocal(manifest) || (!manifest.owner && hasLegacyLocalVault() && !empty)) {
    if (empty && !pendingWrites) {
      await discardLegacyLocalWorkspace();
      return { state: 'ok' };
    }
    return { state: 'blocked', reason: 'legacy-local' };
  }

  const identity = sessionIdentity();
  const unclaimed = !manifest.owner || !manifest.canaryCt;
  const keyOk = unclaimed ? await existingDataOpens() : await canaryOpens(manifest);
  const accountOk = unclaimed || sameAccount(manifest.owner, identity);
  if (keyOk && accountOk) {
    if (unclaimed) await claim(manifest);
    // Only now, with the owner confirmed, may writes queued before the manifest existed join it.
    stampUnboundQueueEntries(manifest.workspaceId);
    return { state: 'ok' };
  }

  // Someone else's workspace. Nothing in it worth keeping: take it over.
  if (!pendingWrites && (empty || (await localResultCount()) === 0)) {
    // Without local results the tables hold only a cache of the other account's server data.
    await replaceWorkspace(null);
    return { state: 'ok' };
  }
  if (pendingWrites) return { state: 'blocked', reason: 'pending-writes' };
  return { state: 'blocked', reason: keyOk ? 'foreign-account' : 'foreign-key' };
}

async function decide(): Promise<WorkspaceStatus> {
  if (!get(sessionStore).sessionKey) return { state: 'unchecked' };

  const manifest = await loadWorkspace();
  const owner = await checkOwner(manifest);
  if (owner.state !== 'ok') return owner;

  // The account's mode, from the server. Offline, fall back to the last answer this tab or browser saw.
  let mode: StorageMode | null;
  let allowed: StorageMode[];
  try {
    const caps = await loadCapabilities();
    mode = caps.storageMode;
    allowed = allowedModesFrom(caps);
  } catch (err) {
    console.warn('[workspace] could not load capabilities, using the cached mode', err);
    const cached = get(capabilitiesStore);
    const current = await currentManifest();
    mode = cached?.storageMode ?? (current?.mode === 'all-server' || current?.mode === 'hybrid' ? current.mode : null);
    allowed = cached ? allowedModesFrom(cached) : allowedModesFrom(null);
  }

  if (!mode || !allowed.includes(mode)) {
    applyMode(null);
    return { state: 'needs-choice' };
  }
  applyMode(mode);
  await rememberMode(mode);
  return { state: 'ok' };
}

/**
 * Checks that the unlocked session owns this browser's workspace, loads the account's storage mode and
 * publishes the result. Call after every unlock and before routes touch the vault.
 */
export async function openWorkspace(): Promise<WorkspaceStatus> {
  let status: WorkspaceStatus;
  try {
    status = await decide();
  } catch (err) {
    console.error('[workspace] opening the workspace failed', err);
    status = { state: 'blocked', reason: 'foreign-key' };
  }
  workspaceStatusStore.set(status);
  return status;
}

/** Read-only view of the manifest. */
export async function currentManifest(): Promise<WorkspaceManifestRecord | undefined> {
  if (!db.isOpen()) await db.open();
  return db.workspace.get('current');
}

/** Deletes a workspace of the discontinued local mode and its passphrase parameters. */
async function discardLegacyLocalWorkspace(): Promise<void> {
  await replaceWorkspace(null);
  removeLegacyLocalVault();
}

/**
 * The blocked screen's last resort: drop this browser's data and claim an empty workspace for the
 * current session, then load the account's mode again. Destroys data the session cannot use anyway.
 */
export async function resetWorkspaceForCurrentSession(): Promise<void> {
  const manifest = await loadWorkspace();
  if (isLegacyLocal(manifest) || hasLegacyLocalVault()) await discardLegacyLocalWorkspace();
  else await replaceWorkspace(null);
  await openWorkspace();
}

/** What a blocked screen may say about this browser's workspace (the manifest holds no secrets). */
export interface WorkspaceSummary {
  mode: ManifestMode;
  accountEmail: string | null;
  backendOrigin: string | null;
  hasData: boolean;
  localResults: number;
}

export async function describeWorkspace(): Promise<WorkspaceSummary> {
  const manifest = await loadWorkspace();
  return {
    mode: manifest.mode,
    accountEmail: manifest.owner?.accountEmail ?? null,
    backendOrigin: manifest.owner?.backendOrigin ?? null,
    hasData: !(await workspaceIsEmpty()),
    localResults: await localResultCount(),
  };
}
