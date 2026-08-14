import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import {
  compareVersions,
  refreshBackendVersion,
  backendVersionStore,
} from '../src/lib/stores/versionStore';
import { backendStore } from '../src/lib/stores/backendStore';

// Mock localStorage for the Vitest environment (backendStore reads it on init).
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

describe('compareVersions', () => {
  it('reports a match when both sides run the same build', () => {
    expect(compareVersions('1.4.0', '1.4.0', true)).toBe('match');
    expect(compareVersions('1.4.0-a1b2c3d', '1.4.0-a1b2c3d', true)).toBe('match');
  });

  it('treats a preview build against its own release as merely out of sync', () => {
    expect(compareVersions('1.4.0-a1b2c3d', '1.4.0', true)).toBe('mismatch');
  });

  it('treats differing minor or patch versions as compatible', () => {
    expect(compareVersions('1.4.0', '1.5.2', true)).toBe('mismatch');
    expect(compareVersions('1.4.1', '1.4.0', true)).toBe('mismatch');
  });

  it('treats a differing major version as incompatible', () => {
    expect(compareVersions('1.4.0', '2.0.0', true)).toBe('incompatible');
    expect(compareVersions('2.0.0', '1.9.9', true)).toBe('incompatible');
    expect(compareVersions('2.0.0-a1b2c3d', '1.4.0', true)).toBe('incompatible');
  });

  it('is unknown when the server version is missing or unparseable', () => {
    expect(compareVersions('1.4.0', null, true)).toBe('unknown');
    expect(compareVersions('1.4.0', 'not-a-version', true)).toBe('unknown');
    expect(compareVersions('nonsense', '1.4.0', true)).toBe('unknown');
  });

  it('is no-server when no backend is configured', () => {
    expect(compareVersions('1.4.0', null, false)).toBe('no-server');
    expect(compareVersions('1.4.0', '1.4.0', false)).toBe('no-server');
  });
});

describe('refreshBackendVersion', () => {
  beforeEach(() => {
    localStorage.clear();
    backendStore.clear();
    backendVersionStore.set(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not call the network when no backend is configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await refreshBackendVersion();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(get(backendVersionStore)).toBeNull();
  });

  it('reads the version from /api/health, outside the /api/v1 prefix', async () => {
    backendStore.set('https://api.example.org');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', version: '1.4.0' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await refreshBackendVersion();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.org/api/health',
      expect.objectContaining({ credentials: 'include' })
    );
    expect(get(backendVersionStore)).toBe('1.4.0');
  });

  it('degrades to unknown when the probe fails, without throwing', async () => {
    backendStore.set('https://api.example.org');
    backendVersionStore.set('1.4.0');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(refreshBackendVersion()).resolves.toBeUndefined();
    expect(get(backendVersionStore)).toBeNull();
  });

  it('degrades to unknown when the server reports no version field', async () => {
    backendStore.set('https://api.example.org');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    }));

    await refreshBackendVersion();

    expect(get(backendVersionStore)).toBeNull();
  });
});
