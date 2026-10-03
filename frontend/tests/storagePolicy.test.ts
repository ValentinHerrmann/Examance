import { describe, it, expect, beforeEach } from 'vitest';
import { storagePolicyStore, DEFAULT_POLICY, getStoragePolicyBadge } from '../src/lib/stores/storagePolicy';
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

  it('persists storageMode changes to localStorage', () => {
    storagePolicyStore.setPolicy({ storageMode: 'all-server', latexCompilation: 'local' });
    expect(get(storagePolicyStore).storageMode).toBe('all-server');
    expect(JSON.parse(localStorage.getItem('bg_storage_policy') || '{}').storageMode).toBe('all-server');
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
});

describe('getStoragePolicyBadge', () => {
  it.each(['all-local', 'all-server', 'hybrid'] as const)('has text and title but no icon for %s', (storageMode) => {
    const badge = getStoragePolicyBadge({ storageMode, latexCompilation: 'local' });
    expect(Object.keys(badge).sort()).toEqual(['text', 'title']);
    expect(badge.text).toBeTruthy();
    expect(badge.title).toBeTruthy();
  });

  it('differs per mode', () => {
    const texts = (['all-local', 'all-server', 'hybrid'] as const).map(
      (storageMode) => getStoragePolicyBadge({ storageMode, latexCompilation: 'local' }).text
    );
    expect(new Set(texts).size).toBe(3);
  });
});
