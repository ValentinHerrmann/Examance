import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import {
  compareVersions,
  refreshBackendVersion,
  backendVersionStore,
  versionUrlFor,
  repoUrl,
} from '../src/lib/stores/versionStore';
import { timeMs } from './helpers/randomStrings';


describe('compareVersions', () => {
  it('reports a match when both sides run the same build', () => {
    expect(compareVersions('1.4.0', '1.4.0')).toBe('match');
    expect(compareVersions('1.4.0-a1b2c3d', '1.4.0-a1b2c3d')).toBe('match');
  });

  it('ignores the preview build time, which differs after a one-sided deploy', () => {
    expect(
      compareVersions('1.4.0-PR#28 [26.09.2026 | 21:00]', '1.4.0-PR#28 [26.09.2026 | 20:30]')
    ).toBe('match');
    expect(
      compareVersions('1.4.0-PR#28 [26.09.2026 | 21:00]', '1.4.0-PR#27 [26.09.2026 | 21:00]')
    ).toBe('mismatch');
  });

  it('treats a preview build against its own release as merely out of sync', () => {
    expect(compareVersions('1.4.0-a1b2c3d', '1.4.0')).toBe('mismatch');
  });

  it('treats differing minor or patch versions as compatible', () => {
    expect(compareVersions('1.4.0', '1.5.2')).toBe('mismatch');
    expect(compareVersions('1.4.1', '1.4.0')).toBe('mismatch');
  });

  it('treats a differing major version as incompatible', () => {
    expect(compareVersions('1.4.0', '2.0.0')).toBe('incompatible');
    expect(compareVersions('2.0.0', '1.9.9')).toBe('incompatible');
    expect(compareVersions('2.0.0-a1b2c3d', '1.4.0')).toBe('incompatible');
  });

  it('is unknown when the server version is missing or unparseable', () => {
    expect(compareVersions('1.4.0', null)).toBe('unknown');
    expect(compareVersions('1.4.0', 'not-a-version')).toBe('unknown');
    expect(compareVersions('nonsense', '1.4.0')).toBe('unknown');
  });

});

describe('versionUrlFor', () => {
  it('links a tagged release to its GitHub Release', () => {
    expect(versionUrlFor('1.4.0', '')).toBe(`${repoUrl}/releases/tag/v1.4.0`);
    expect(versionUrlFor('1.4.0', 'a1b2c3d')).toBe(`${repoUrl}/releases/tag/v1.4.0`);
  });

  it('links a preview build to the exact commit it was built from', () => {
    expect(versionUrlFor('1.4.0-a1b2c3d', 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')).toBe(
      `${repoUrl}/commit/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2`
    );
  });

  it('has no link for a build with no commit SHA (local dev)', () => {
    expect(versionUrlFor('0.0.0-dev', '')).toBeNull();
  });
});

describe('refreshBackendVersion', () => {
  beforeEach(() => {
    backendVersionStore.set(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the version from /api/health, outside the /api/v1 prefix', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', version: '1.4.0' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await refreshBackendVersion();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({ credentials: 'include' })
    );
    expect(get(backendVersionStore)).toBe('1.4.0');
  });

  it('degrades to unknown when the probe fails, without throwing', async () => {
    backendVersionStore.set('1.4.0');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(refreshBackendVersion()).resolves.toBeUndefined();
    expect(get(backendVersionStore)).toBeNull();
  });

  it('degrades to unknown when the server reports no version field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    }));

    await refreshBackendVersion();

    expect(get(backendVersionStore)).toBeNull();
  });
});

describe('compareVersions build stamps (SonarCloud S8786)', () => {
  it('drops only the trailing bracketed stamp', () => {
    expect(compareVersions('1.2.3 [01.01.2026 | 10:00]', '1.2.3   [02.01.2026 | 11:00]')).toBe('match');
    expect(compareVersions('1.2.3 [a[b]', '1.2.3')).toBe('match');
    expect(compareVersions('1.2.3 [a] x', '1.2.3')).not.toBe('match');
    expect(compareVersions('1.2.3]', '1.2.3')).not.toBe('match');
  });

  it('stays linear on long whitespace runs', () => {
    const input = '1.0.0' + ' '.repeat(100_000) + '[x';
    expect(timeMs(() => compareVersions(input, '1.0.0'))).toBeLessThan(200);
  });
});
