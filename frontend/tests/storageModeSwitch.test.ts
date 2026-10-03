import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';

import { db } from '../src/lib/db/db';
import {
  DEFAULT_POLICY,
  armStorageModeSwitch,
  disarmStorageModeSwitch,
  storagePolicyStore,
} from '../src/lib/stores/storagePolicy';
import { adoptServerStorageIfPristine, currentManifest, loadWorkspace } from '../src/lib/db/workspace';
import { offlineQueue } from '../src/lib/services/offlineQueue';
import {
  abortModeSwitch,
  beginModeSwitch,
  PendingWritesError,
  commitModeSwitch,
  finishModeSwitch,
  localWorkspaceIsEmpty,
  markExported,
  pendingSwitchStore,
  requireExport,
} from '../src/lib/services/storageModeSwitch';

describe('storage mode is not settable outside a gated switch', () => {
  beforeEach(() => {
    disarmStorageModeSwitch();
    pendingSwitchStore.set(null);
    storagePolicyStore.setPolicy(DEFAULT_POLICY);
  });

  it('refuses a mode change without a token', () => {
    // Signing in used to flip all-local -> all-server right here, and the next
    // idle lock then wiped the whole local database.
    expect(() => storagePolicyStore.commitStorageMode('all-server', 'made-up')).toThrow();
    expect(get(storagePolicyStore).storageMode).toBe('all-local');
  });

  it('refuses a stale token from an earlier switch', () => {
    const first = armStorageModeSwitch();
    armStorageModeSwitch(); // a second switch supersedes the first
    expect(() => storagePolicyStore.commitStorageMode('all-server', first)).toThrow();
  });

  it('accepts the token the active switch holds', () => {
    const token = armStorageModeSwitch();
    storagePolicyStore.commitStorageMode('hybrid', token);
    expect(get(storagePolicyStore).storageMode).toBe('hybrid');
  });
});

describe('gated switch flow', () => {
  beforeEach(async () => {
    disarmStorageModeSwitch();
    pendingSwitchStore.set(null);
    storagePolicyStore.setPolicy(DEFAULT_POLICY);
    await db.exams.clear();
    await db.exercises.clear();
    await db.students.clear();
    await db.submissions.clear();
    await db.exerciseScores.clear();
    await db.workspace.clear();
    offlineQueue.set([]);
  });

  it('refuses to wipe and switch before an export has been recorded', async () => {
    beginModeSwitch('all-server');
    requireExport();

    await expect(commitModeSwitch()).rejects.toThrow(/exported/i);
    // Nothing moved: the mode is unchanged and the switch is still open.
    expect(get(storagePolicyStore).storageMode).toBe('all-local');
    expect(get(pendingSwitchStore)?.phase).toBe('export');
  });

  it('wipes the local store and switches once the export is recorded', async () => {
    await db.exams.put({
      id: 'exam-1',
      teacherId: 't1',
      retentionUntil: '2030-01-01',
      compilationStatus: 'pending',
      createdAt: new Date().toISOString(),
    });

    beginModeSwitch('all-server');
    requireExport();
    markExported('workspace.bgproj');
    await commitModeSwitch();

    expect(get(storagePolicyStore).storageMode).toBe('all-server');
    expect(await db.exams.count()).toBe(0);
    // Still open, so the wizard can offer the re-import step.
    expect(get(pendingSwitchStore)?.phase).toBe('reimport');

    finishModeSwitch();
    expect(get(pendingSwitchStore)).toBeNull();
  });

  it('can be abandoned before the wipe, but not after', async () => {
    beginModeSwitch('all-server');
    expect(abortModeSwitch()).toBe(true);
    expect(get(pendingSwitchStore)).toBeNull();

    beginModeSwitch('all-server');
    requireExport();
    markExported('workspace.bgproj');
    await commitModeSwitch();

    // The local store is already gone; going back would present an empty
    // workspace as if it were intact.
    expect(abortModeSwitch()).toBe(false);
    expect(get(pendingSwitchStore)?.phase).toBe('reimport');
  });

  it('reports an empty local workspace so the export step can be skipped', async () => {
    expect(await localWorkspaceIsEmpty()).toBe(true);
    await db.exams.put({
      id: 'exam-2',
      teacherId: 't1',
      retentionUntil: '2030-01-01',
      compilationStatus: 'pending',
      createdAt: new Date().toISOString(),
    });
    expect(await localWorkspaceIsEmpty()).toBe(false);
  });

  it('adopts server storage on sign-in only for a pristine workspace', async () => {
    expect(await adoptServerStorageIfPristine()).toBe(true);
    expect(get(storagePolicyStore).storageMode).toBe('all-server');
    // The token is spent: nothing else can change the mode afterwards.
    expect(() => storagePolicyStore.commitStorageMode('all-local', 'made-up')).toThrow();
    // Adoption counts as a choice: it never happens twice.
    expect((await currentManifest())?.explicit).toBe(true);
  });

  it('never switches a workspace that holds local data', async () => {
    await db.exams.put({
      id: 'exam-3',
      teacherId: 't1',
      retentionUntil: '2030-01-01',
      compilationStatus: 'pending',
      createdAt: new Date().toISOString(),
    });
    expect(await adoptServerStorageIfPristine()).toBe(false);
    expect(get(storagePolicyStore).storageMode).toBe('all-local');
    expect(await db.exams.count()).toBe(1);
  });

  it('never adopts a mode someone chose, even when the workspace is empty', async () => {
    // all-local -> "import later" -> reload used to flip back to all-server here.
    await loadWorkspace();
    beginModeSwitch('hybrid');
    requireExport();
    markExported();
    await commitModeSwitch();
    finishModeSwitch();
    beginModeSwitch('all-local');
    requireExport();
    markExported();
    await commitModeSwitch();
    finishModeSwitch();

    expect(await adoptServerStorageIfPristine()).toBe(false);
    expect(get(storagePolicyStore).storageMode).toBe('all-local');
  });

  it('stamps the new mode into the manifest together with the wipe', async () => {
    beginModeSwitch('hybrid');
    requireExport();
    markExported();
    await commitModeSwitch();
    const manifest = await currentManifest();
    expect(manifest?.mode).toBe('hybrid');
    expect(manifest?.explicit).toBe(true);
  });

  it('refuses to start a switch while writes still wait for the server', async () => {
    const { workspaceId } = await loadWorkspace();
    offlineQueue.set([{ id: 'q1', url: '/exams', method: 'POST', body: {}, timestamp: 0, workspaceId }]);
    expect(() => beginModeSwitch('all-local')).toThrow(PendingWritesError);
    expect(get(pendingSwitchStore)).toBeNull();
  });
});
