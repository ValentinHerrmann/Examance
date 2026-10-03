/**
 * The workspace manifest: one row in IndexedDB stating which storage mode the data beside it belongs to
 * and whose key sealed it. Invariants (docs/dev/storage_modes.md):
 * - I1 The manifest is the source of truth for the mode; `bg_storage_policy` is only a boot cache.
 * - I2 A mode change is one transaction: every data table is cleared and the new manifest written together.
 * - I3 A session opens the workspace only if it owns it: the canary must decrypt under its key, and a
 *   server-backed workspace must belong to the signed-in account on the same backend.
 * - I4 Nothing changes the mode implicitly, except adopting server storage at an explicit sign-in on a
 *   workspace nobody ever chose a mode for and that holds nothing.
 */

import { get } from 'svelte/store';
import { db, vaultTables } from './db';
import type { WorkspaceManifestRecord, WorkspaceOwner } from './schema';
import { decrypt, encrypt } from '#lib/crypto/aesGcm';
import { backendStore } from '#lib/stores/backendStore';
import { sessionStore } from '#lib/stores/session';
import {
  armStorageModeSwitch,
  disarmStorageModeSwitch,
  hasCachedStorageMode,
  storagePolicyStore,
  type StorageMode,
} from '#lib/stores/storagePolicy';
import { workspaceIdStore, workspaceStatusStore, type WorkspaceStatus } from '#lib/stores/workspaceState';
import { clearOfflineQueue, hasQueuedWrites, stampUnboundQueueEntries } from '#lib/services/offlineQueue';
import { safeLocalStorage } from '#lib/utils/storage';

/** Mirror of the current workspace id in localStorage: other tabs reload when it changes (`workspaceSync.ts`). */
export const WORKSPACE_ID_KEY = 'bg_workspace_id';

const CANARY_TEXT = 'examance-workspace-canary-v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function applyMode(mode: StorageMode): void {
  if (get(storagePolicyStore).storageMode === mode) return;
  try {
    storagePolicyStore.commitStorageMode(mode, armStorageModeSwitch());
  } finally {
    disarmStorageModeSwitch();
  }
}

function publish(manifest: WorkspaceManifestRecord): void {
  applyMode(manifest.mode);
  workspaceIdStore.set(manifest.workspaceId);
  if (safeLocalStorage.getItem(WORKSPACE_ID_KEY) !== manifest.workspaceId) {
    safeLocalStorage.setItem(WORKSPACE_ID_KEY, manifest.workspaceId);
  }
}

function newManifest(mode: StorageMode, explicit: boolean): WorkspaceManifestRecord {
  return {
    id: 'current',
    workspaceId: crypto.randomUUID(),
    mode,
    owner: null,
    canaryCt: null,
    canaryIv: null,
    explicit,
    createdAt: new Date().toISOString(),
  };
}

/** True when no data table holds a row; the manifest itself does not count. */
export async function workspaceIsEmpty(): Promise<boolean> {
  if (!db.exams) return true;
  const counts = await Promise.all(vaultTables().map((t) => t.count()));
  return counts.every((n) => n === 0);
}

/**
 * Loads the manifest and publishes its mode, creating it on first use. A browser from before the
 * manifest gets one from its cached mode; the mode counts as chosen when data exists or a non-default
 * mode was cached (a cached `all-local` alone may just be the default written by the LaTeX setting).
 */
export async function loadWorkspace(): Promise<WorkspaceManifestRecord> {
  if (!db.isOpen()) await db.open();
  const cachedMode = get(storagePolicyStore).storageMode;
  const explicitHint = hasCachedStorageMode() && cachedMode !== 'all-local';
  const empty = await workspaceIsEmpty();

  const manifest = await db.transaction('rw', db.workspace, async () => {
    const existing = await db.workspace.get('current');
    if (existing) return existing;
    const fresh = newManifest(cachedMode, explicitHint || !empty);
    await db.workspace.put(fresh);
    return fresh;
  });
  // Writes queued before the manifest existed (or before this tab loaded it) belong to this workspace;
  // entries of a replaced workspace always carry their old id and are never adopted.
  stampUnboundQueueEntries(manifest.workspaceId);
  publish(manifest);
  return manifest;
}

/**
 * Replaces the whole workspace with an empty one in `mode` (I2): data tables and manifest change in one
 * transaction, so a failure leaves the old mode with all its data. Clears the offline queue (its writes
 * belong to a workspace that no longer exists) and claims the new workspace for the current session.
 * @throws when IndexedDB refuses; nothing has changed then.
 */
export async function replaceWorkspace(
  mode: StorageMode,
  { explicit }: { explicit: boolean }
): Promise<WorkspaceManifestRecord> {
  if (!db.isOpen()) await db.open();
  const manifest = newManifest(mode, explicit);
  const tables = [...vaultTables(), db.workspace];
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
    await db.workspace.put(manifest);
  });
  const { clearCompileCache } = await import('#lib/latex/compileCache');
  clearCompileCache();
  clearOfflineQueue();
  publish(manifest);
  if (get(sessionStore).sessionKey) return claim(manifest);
  return manifest;
}

function sessionIdentity(): WorkspaceOwner {
  const s = get(sessionStore);
  if (s.email === null) return { kind: 'local-vault', accountId: null, backendOrigin: null };
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
  return !!a && a.accountId === b.accountId && a.backendOrigin === b.backendOrigin;
}

async function decide(): Promise<WorkspaceStatus> {
  const session = get(sessionStore);
  if (!session.sessionKey) return { state: 'unchecked' };

  const manifest = await loadWorkspace();
  const serverBacked = manifest.mode !== 'all-local';
  const identity = sessionIdentity();

  // I5: server-backed data is only reachable signed in; a passphrase session must not read its cache.
  if (serverBacked && identity.kind !== 'account') return { state: 'blocked', reason: 'needs-sign-in' };

  // An unclaimed workspace (first unlock since the manifest exists) is judged by its existing data.
  const unclaimed = !manifest.owner || !manifest.canaryCt;
  const keyOk = unclaimed ? await existingDataOpens() : await canaryOpens(manifest);
  const accountOk = unclaimed || !serverBacked || sameAccount(manifest.owner, identity);
  if (keyOk && accountOk) {
    if (unclaimed) await claim(manifest);
    return { state: 'ok' };
  }

  // Someone else's workspace. Nothing in it: take it over.
  const pendingWrites = hasQueuedWrites(manifest.workspaceId);
  if (!pendingWrites && (await workspaceIsEmpty())) {
    await replaceWorkspace(manifest.mode, { explicit: manifest.explicit });
    return { state: 'ok' };
  }
  // An all-server workspace only holds a cache of the server; drop it unless it carries unsent writes.
  if (manifest.mode === 'all-server') {
    if (pendingWrites) return { state: 'blocked', reason: 'pending-writes' };
    await replaceWorkspace('all-server', { explicit: manifest.explicit });
    return { state: 'ok' };
  }
  return { state: 'blocked', reason: keyOk ? 'foreign-account' : 'foreign-key' };
}

/**
 * Checks that the unlocked session owns this browser's workspace (I3) and publishes the result. Call
 * after every unlock (sign-in, passphrase, restored session) and before routes touch the vault.
 */
export async function openWorkspace(): Promise<WorkspaceStatus> {
  let status: WorkspaceStatus;
  try {
    status = await decide();
  } catch (err) {
    console.error('[workspace] owner check failed', err);
    status = { state: 'blocked', reason: 'foreign-key' };
  }
  workspaceStatusStore.set(status);
  return status;
}

/** Read-only view of the manifest for settings and the switch service. */
export async function currentManifest(): Promise<WorkspaceManifestRecord | undefined> {
  if (!db.isOpen()) await db.open();
  return db.workspace.get('current');
}

/**
 * The blocked screen's last resort: drop this browser's data (same mode, unless the session cannot use
 * it) and claim an empty workspace for the current session. Destroys data the session cannot read anyway.
 */
export async function resetWorkspaceForCurrentSession(): Promise<void> {
  const manifest = await loadWorkspace();
  const mode = manifest.mode !== 'all-local' && get(sessionStore).email === null ? 'all-local' : manifest.mode;
  await replaceWorkspace(mode, { explicit: true });
  workspaceStatusStore.set({ state: 'ok' });
}

/**
 * I4: on an explicit server sign-in, a workspace nobody chose a mode for and that holds nothing adopts
 * server storage, so a fresh browser shows the account's data instead of an empty local vault. Any
 * workspace with data, or whose mode was chosen (wizard, earlier adoption, legacy data), keeps its mode.
 * Never call this on reload. Returns true when the mode changed.
 */
export async function adoptServerStorageIfPristine(): Promise<boolean> {
  const manifest = await loadWorkspace();
  if (manifest.mode !== 'all-local' || manifest.explicit) return false;
  if (!(await workspaceIsEmpty()) || hasQueuedWrites(manifest.workspaceId)) return false;
  await replaceWorkspace('all-server', { explicit: true });
  return true;
}

/** What the UI may say about this browser's workspace, also while locked (the manifest holds no secrets). */
export interface WorkspaceSummary {
  mode: StorageMode;
  /** Null: not yet bound to a key (fresh or legacy browser). */
  ownerKind: WorkspaceOwner['kind'] | null;
  accountEmail: string | null;
  backendOrigin: string | null;
  hasData: boolean;
}

export async function describeWorkspace(): Promise<WorkspaceSummary> {
  const manifest = await loadWorkspace();
  return {
    mode: manifest.mode,
    ownerKind: manifest.owner?.kind ?? null,
    accountEmail: manifest.owner?.accountEmail ?? null,
    backendOrigin: manifest.owner?.backendOrigin ?? null,
    hasData: !(await workspaceIsEmpty()),
  };
}
