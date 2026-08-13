import { describe, it, expect, beforeEach } from 'vitest';
import { backendStore, effectiveBackendStore, normalizeBackendUrl } from '../src/lib/stores/backendStore';
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

// NOTE: these use https:// throughout. Auth cookies are set with `Secure`, so a
// plain-http backend on a non-loopback host could never hold a session anyway —
// normalizeBackendUrl rejects it up front instead of failing mysteriously later.
describe('backendStore', () => {
  beforeEach(() => {
    localStorage.clear();
    backendStore.clear();
  });

  it('defaults to empty string without falling back to origin', () => {
    expect(get(backendStore)).toBe('');
    expect(get(effectiveBackendStore)).toBe('');
  });

  it('supports transient URL without saving to localStorage', () => {
    backendStore.setTransient('https://temp-server.example');
    expect(get(backendStore)).toBe('https://temp-server.example');
    expect(localStorage.getItem('bg_backend_url')).toBeNull();
  });

  it('saves successful URL to localStorage', () => {
    backendStore.saveSuccessfulBackendUrl('https://active-server.example');
    expect(get(backendStore)).toBe('https://active-server.example');
    expect(localStorage.getItem('bg_backend_url')).toBe('https://active-server.example');
  });

  it('restores saved URL from localStorage on demand', () => {
    localStorage.setItem('bg_backend_url', 'https://saved-server.example');
    backendStore.setTransient('https://failed-server.example');
    expect(get(backendStore)).toBe('https://failed-server.example');

    backendStore.restoreSavedUrl();
    expect(get(backendStore)).toBe('https://saved-server.example');
  });

  it('ignores a hostile value already present in localStorage', () => {
    localStorage.setItem('bg_backend_url', 'http://attacker.example');
    backendStore.restoreSavedUrl();
    expect(get(backendStore)).toBe('');
  });
});

describe('normalizeBackendUrl', () => {
  it('accepts https origins and strips path, query and trailing slash', () => {
    expect(normalizeBackendUrl('https://api.example.org/')).toBe('https://api.example.org');
    expect(normalizeBackendUrl('https://api.example.org:8443')).toBe('https://api.example.org:8443');
  });

  it('allows plain http only for loopback development', () => {
    expect(normalizeBackendUrl('http://localhost:8000')).toBe('http://localhost:8000');
    expect(normalizeBackendUrl('http://127.0.0.1:8000')).toBe('http://127.0.0.1:8000');
  });

  it('treats empty input as "not configured"', () => {
    expect(normalizeBackendUrl('')).toBe('');
    expect(normalizeBackendUrl('   ')).toBe('');
  });

  it.each([
    ['http://attacker.example', 'plain http to a non-loopback host'],
    ['https://user:pw@api.example.org', 'embedded credentials'],
    ['https://api.example.org?next=evil', 'query string'],
    ['not-a-url', 'unparseable input'],
    ['ftp://api.example.org', 'non-http scheme'],
    ['javascript:alert(1)', 'javascript scheme'],
  ])('rejects %s (%s)', (input) => {
    expect(() => normalizeBackendUrl(input)).toThrow();
  });
});
