import { describe, it, expect, beforeEach } from 'vitest';
import { storagePolicyStore, DEFAULT_POLICY, getStoragePolicyBadge, localSwitchPending, switchToLocalOnce } from '../src/lib/stores/storagePolicy';
import { get } from 'svelte/store';

// Mock localStorage for Vitest environment
const mockStorage: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, val: string) => { mockStorage[key] = val; },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => {
    for (const k of Object.keys(mockStorage)) {
      delete mockStorage[k];
    }
  },
  length: 0,
  key: () => null,
};

describe('storagePolicyStore', () => {
  beforeEach(() => {
    localStorage.clear();
    storagePolicyStore.setPolicy(DEFAULT_POLICY);
  });

  it('initializes with default policy when localStorage is empty', () => {
    expect(get(storagePolicyStore)).toEqual(DEFAULT_POLICY);
  });

  it('never persists the storage mode in this browser: it belongs to the account', () => {
    storagePolicyStore.setPolicy({ storageMode: 'all-server', latexCompilation: 'local' });
    expect(get(storagePolicyStore).storageMode).toBe('all-server');
    expect(localStorage.getItem('bg_storage_policy')).toBeNull();
  });

  it('persists latexCompilation changes to localStorage', () => {
    storagePolicyStore.updateSetting('latexCompilation', 'server');
    expect(get(storagePolicyStore).latexCompilation).toBe('server');
    expect(localStorage.getItem('bg_latex_compilation')).toBe('server');
  });

  it('never writes the storage mode when the LaTeX engine changes', () => {
    // A tab still holding the old mode in memory used to write it back here.
    localStorage.setItem('bg_storage_policy', JSON.stringify({ storageMode: 'hybrid' }));
    storagePolicyStore.updateSetting('latexCompilation', 'local');
    expect(JSON.parse(localStorage.getItem('bg_storage_policy') || '{}').storageMode).toBe('hybrid');
  });

  it('defaults to the browser engine', () => {
    expect(DEFAULT_POLICY.latexCompilation).toBe('local');
  });

  it('moves a browser that chose the server to the browser engine once', () => {
    storagePolicyStore.updateSetting('latexCompilation', 'server');
    expect(localSwitchPending()).toBe(true);
    expect(switchToLocalOnce()).toBe(true);
    expect(localStorage.getItem('bg_latex_compilation')).toBe('local');
    expect(localSwitchPending()).toBe(false);
    // Switching back afterwards sticks: the move is never repeated.
    storagePolicyStore.updateSetting('latexCompilation', 'server');
    expect(localSwitchPending()).toBe(false);
  });

  it('counts a browser without a stored choice as moved: it compiled on the server under the old default', () => {
    localStorage.removeItem('bg_latex_compilation');
    expect(switchToLocalOnce()).toBe(true);
    expect(localStorage.getItem('bg_latex_compilation')).toBe('local');
  });

  it('reports no change for a browser that already compiles locally', () => {
    storagePolicyStore.updateSetting('latexCompilation', 'local');
    expect(switchToLocalOnce()).toBe(false);
    expect(localSwitchPending()).toBe(false);
  });
});

describe('getStoragePolicyBadge', () => {
  it.each([null, 'all-server', 'hybrid'] as const)('has text and title but no icon for %s', (storageMode) => {
    const badge = getStoragePolicyBadge({ storageMode, latexCompilation: 'local' });
    expect(Object.keys(badge).sort()).toEqual(['text', 'title']);
    expect(badge.text).toBeTruthy();
    expect(badge.title).toBeTruthy();
  });

  it('differs per mode', () => {
    const texts = ([null, 'all-server', 'hybrid'] as const).map(
      (storageMode) => getStoragePolicyBadge({ storageMode, latexCompilation: 'local' }).text
    );
    expect(new Set(texts).size).toBe(3);
  });
});
