import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';

import { clearAllTables, db } from '../src/lib/db/db';
import {
  DEFAULT_POLICY,
  armStorageModeSwitch,
  disarmStorageModeSwitch,
  storagePolicyStore,
} from '../src/lib/stores/storagePolicy';
import { currentManifest, loadWorkspace, localResultCount } from '../src/lib/db/workspace';
import { offlineQueue } from '../src/lib/services/offlineQueue';
import {
  PendingWritesError,
  beginModeSwitch,
  finishModeSwitch,
  pendingSwitchStore,
} from '../src/lib/services/storageModeSwitch';
import { directionFor } from '../src/lib/services/resultsMover';

// Vitest runs in node: an in-memory localStorage for the manifest's legacy-cache reads. safeLocalStorage probes lazily and retries, so installing it here is early enough.
const mockStorage: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, val: string) => { mockStorage[key] = val; },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => { for (const k of Object.keys(mockStorage)) delete mockStorage[k]; },
  length: 0,
  key: () => null,
};

describe('storage mode is not settable outside the workspace layer', () => {
  beforeEach(() => {
    disarmStorageModeSwitch();
    storagePolicyStore.setPolicy(DEFAULT_POLICY);
  });

  it('has no default mode: the account chooses explicitly', () => {
    expect(get(storagePolicyStore).storageMode).toBeNull();
  });

  it('refuses a mode change without a token', () => {
    expect(() => storagePolicyStore.commitStorageMode('all-server', 'made-up')).toThrow();
    expect(get(storagePolicyStore).storageMode).toBeNull();
  });

  it('refuses a stale token', () => {
    const first = armStorageModeSwitch();
    armStorageModeSwitch();
    expect(() => storagePolicyStore.commitStorageMode('all-server', first)).toThrow();
  });

  it('accepts the armed token', () => {
    storagePolicyStore.commitStorageMode('hybrid', armStorageModeSwitch());
    expect(get(storagePolicyStore).storageMode).toBe('hybrid');
  });
});

describe('fluent switch coordination', () => {
  beforeEach(async () => {
    finishModeSwitch();
    offlineQueue.set([]);
    await db.workspace.clear();
    await db.students.clear();
    await db.submissions.clear();
    await db.exerciseScores.clear();
  });

  it('moves results towards the browser for hybrid and towards the server for all-server', () => {
    expect(directionFor('hybrid')).toBe('to-browser');
    expect(directionFor('all-server')).toBe('to-server');
  });

  it('records the move so other tabs can block, and clears it when done', () => {
    beginModeSwitch(null, 'hybrid');
    expect(get(pendingSwitchStore)).toMatchObject({ from: null, to: 'hybrid' });
    finishModeSwitch();
    expect(get(pendingSwitchStore)).toBeNull();
  });

  it('refuses to start while writes still wait for the server', async () => {
    const { workspaceId } = await loadWorkspace();
    offlineQueue.set([{ id: 'q1', url: '/exams', method: 'POST', body: {}, timestamp: 0, workspaceId }]);
    expect(() => beginModeSwitch('all-server', 'hybrid')).toThrow(PendingWritesError);
    expect(get(pendingSwitchStore)).toBeNull();
  });

  it('counts only results as local results', async () => {
    expect(await localResultCount()).toBe(0);
    await db.submissions.put({
      id: 'sub-1',
      examId: 'exam-1',
      pseudonymHash: 'p',
      createdAt: new Date().toISOString(),
    } as never);
    expect(await localResultCount()).toBe(1);
  });
});

describe('workspace manifest', () => {
  beforeEach(async () => {
    localStorage.clear();
    await db.workspace.clear();
    // Every data table: rows left by the blocks above would make the browser look non-empty.
    await clearAllTables();
  });

  it('starts an empty browser without a mode', async () => {
    const manifest = await loadWorkspace();
    expect(manifest.mode).toBeNull();
    expect((await currentManifest())?.workspaceId).toBe(manifest.workspaceId);
  });

  it('recognises data of the discontinued local mode', async () => {
    // No cached mode at all was the old default: all-local.
    await db.exams.put({
      id: 'exam-legacy',
      teacherId: 't1',
      retentionUntil: '2030-01-01',
      compilationStatus: 'pending',
      createdAt: new Date().toISOString(),
    });
    const manifest = await loadWorkspace();
    expect(manifest.mode).toBe('all-local');
  });

  it('keeps a former hybrid browser recognisable', async () => {
    localStorage.setItem('bg_storage_policy', JSON.stringify({ storageMode: 'hybrid' }));
    await db.exams.put({
      id: 'exam-hybrid',
      teacherId: 't1',
      retentionUntil: '2030-01-01',
      compilationStatus: 'pending',
      createdAt: new Date().toISOString(),
    });
    const manifest = await loadWorkspace();
    expect(manifest.mode).toBe('hybrid');
    // The per-browser cache is gone; the account's mode lives on the server now.
    expect(localStorage.getItem('bg_storage_policy')).toBeNull();
  });
});

describe('cleanup after a move to the server (F11)', () => {
  it('clears only the exams that moved; a skipped exam keeps its local results', async () => {
    const { deleteOldCopy } = await import('../src/lib/services/resultsMover');
    await clearAllTables();
    const row = (examId: string, id: string) => ({ examId, id }) as never;
    await db.students.bulkPut([{ pseudonymId: 'p-moved', examId: 'moved' }, { pseudonymId: 'p-kept', examId: 'skipped' }] as never[]);
    await db.submissions.bulkPut([row('moved', 's-moved'), row('skipped', 's-kept')]);
    await db.exerciseScores.bulkPut([
      { id: 'sc-moved', submissionId: 's-moved', exerciseId: 'e' },
      { id: 'sc-kept', submissionId: 's-kept', exerciseId: 'e' },
    ] as never[]);

    expect(await deleteOldCopy('to-server', ['moved'])).toEqual({ students: 1, submissions: 1 });
    expect((await db.students.toArray()).map((s) => s.examId)).toEqual(['skipped']);
    expect((await db.submissions.toArray()).map((s) => s.id)).toEqual(['s-kept']);
    expect((await db.exerciseScores.toArray()).map((s) => s.id)).toEqual(['sc-kept']);
  });
});
