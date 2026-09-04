import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  backendStore,
  effectiveBackendStore,
  normalizeBackendUrl,
  inferBackendProtocol,
  stripBackendProtocol,
  isLoopbackHost,
  isLocalhostFrontend,
  defaultBackendUrl,
  knownServerSuggestions,
} from '../src/lib/stores/backendStore';
import { get } from 'svelte/store';
import { getRecentValues } from '../src/lib/utils/recentValues';

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

describe('backendStore', () => {
  beforeEach(() => {
    localStorage.clear();
    backendStore.clear();
  });

  it('defaults to empty string without falling back to origin in test env', () => {
    expect(get(backendStore)).toBe('');
    expect(get(effectiveBackendStore)).toBe('');
  });

  it('supports transient URL without saving to localStorage', () => {
    backendStore.setTransient('https://temp-server.example');
    expect(get(backendStore)).toBe('https://temp-server.example');
    expect(localStorage.getItem('bg_backend_url')).toBeNull();
  });

  it('saves successful URL to localStorage and records in recent suggestions', () => {
    backendStore.saveSuccessfulBackendUrl('https://active-server.example');
    expect(get(backendStore)).toBe('https://active-server.example');
    expect(localStorage.getItem('bg_backend_url')).toBe('https://active-server.example');
    expect(getRecentValues('backend.url')).toContain('active-server.example');
  });

  it('restores saved URL from localStorage on demand', () => {
    localStorage.setItem('bg_backend_url', 'https://saved-server.example');
    backendStore.setTransient('https://failed-server.example');
    expect(get(backendStore)).toBe('https://failed-server.example');

    backendStore.restoreSavedUrl();
    expect(get(backendStore)).toBe('https://saved-server.example');
  });

  it('ignores an invalid/malicious value in localStorage', () => {
    localStorage.setItem('bg_backend_url', 'javascript:alert(1)');
    backendStore.restoreSavedUrl();
    expect(get(backendStore)).toBe('');
  });
});

describe('normalizeBackendUrl', () => {
  it('accepts https origins and strips path and trailing slash', () => {
    expect(normalizeBackendUrl('https://api.example.org/')).toBe('https://api.example.org');
    expect(normalizeBackendUrl('https://api.example.org:8443')).toBe('https://api.example.org:8443');
    expect(normalizeBackendUrl('https://api.example.org/api/v1')).toBe('https://api.example.org');
  });

  it('forces https on non-local hosts, even when http or no protocol is entered', () => {
    expect(normalizeBackendUrl('http://api.example.org')).toBe('https://api.example.org');
    expect(normalizeBackendUrl('http://attacker.example')).toBe('https://attacker.example');
    expect(normalizeBackendUrl('api.example.org')).toBe('https://api.example.org');
    expect(normalizeBackendUrl('my-school.edu:8443')).toBe('https://my-school.edu:8443');
  });

  it('forces http on loopback/localhost development hosts, even if https is entered', () => {
    expect(normalizeBackendUrl('http://localhost:8000')).toBe('http://localhost:8000');
    expect(normalizeBackendUrl('https://localhost:8000')).toBe('http://localhost:8000');
    expect(normalizeBackendUrl('localhost:8000')).toBe('http://localhost:8000');
    expect(normalizeBackendUrl('http://127.0.0.1:8000')).toBe('http://127.0.0.1:8000');
    expect(normalizeBackendUrl('https://127.0.0.1:8000')).toBe('http://127.0.0.1:8000');
    expect(normalizeBackendUrl('127.0.0.1:8000')).toBe('http://127.0.0.1:8000');
    expect(normalizeBackendUrl('http://[::1]:8000')).toBe('http://[::1]:8000');
    expect(normalizeBackendUrl('https://[::1]:8000')).toBe('http://[::1]:8000');
  });

  it('treats empty input as "not configured"', () => {
    expect(normalizeBackendUrl('')).toBe('');
    expect(normalizeBackendUrl('   ')).toBe('');
  });

  it.each([
    ['https://user:pw@api.example.org', 'embedded credentials with scheme'],
    ['user:pw@api.example.org', 'embedded credentials without scheme'],
    ['https://api.example.org?next=evil', 'query string with scheme'],
    ['api.example.org?next=evil', 'query string without scheme'],
    ['https://api.example.org#frag', 'fragment with scheme'],
    ['api.example.org#frag', 'fragment without scheme'],
    ['not-a-url', 'unparseable input without domain dots'],
    ['ftp://api.example.org', 'non-http scheme'],
    ['javascript:alert(1)', 'javascript scheme'],
  ])('rejects %s (%s)', (input) => {
    expect(() => normalizeBackendUrl(input)).toThrow();
  });
});

describe('protocol inference and helpers', () => {
  it('correctly identifies loopback hosts', () => {
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('127.0.0.2')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
    expect(isLoopbackHost('api.example.com')).toBe(false);
    expect(isLoopbackHost('192.168.1.100')).toBe(false);
  });

  it('strips backend protocol prefix', () => {
    expect(stripBackendProtocol('https://api.example.com')).toBe('api.example.com');
    expect(stripBackendProtocol('http://localhost:8000')).toBe('localhost:8000');
    expect(stripBackendProtocol('localhost:8000')).toBe('localhost:8000');
  });

  it('infers http for loopback and https for others', () => {
    expect(inferBackendProtocol('localhost:8000')).toBe('http:');
    expect(inferBackendProtocol('http://localhost:8000')).toBe('http:');
    expect(inferBackendProtocol('https://127.0.0.1:8000')).toBe('http:');
    expect(inferBackendProtocol('api.example.org')).toBe('https:');
    expect(inferBackendProtocol('http://api.example.org')).toBe('https:');
    expect(inferBackendProtocol('my-server.valentin-herrmann.com')).toBe('https:');
  });
});

describe('localhost frontend execution detection and defaults', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete (globalThis as any).window;
    }
  });

  it('detects when running on localhost frontend and defaults to http://localhost:8000', () => {
    (globalThis as any).window = {
      location: {
        hostname: 'localhost',
      },
    };

    expect(isLocalhostFrontend()).toBe(true);
    expect(defaultBackendUrl()).toBe('http://localhost:8000');
    const suggestions = knownServerSuggestions();
    expect(suggestions[0]).toBe('localhost:8000');
    expect(suggestions).toContain('localhost:8000');
    expect(suggestions.some((s) => s.includes('prev-api-examance'))).toBe(true);
    expect(suggestions.some((s) => s.includes('api-examance'))).toBe(true);
  });

  it('detects non-localhost frontend and includes prod, prev, and localhost suggestions', () => {
    (globalThis as any).window = {
      location: {
        hostname: 'examance.valentin-herrmann.com',
      },
    };

    expect(isLocalhostFrontend()).toBe(false);
    const suggestions = knownServerSuggestions();
    expect(suggestions).toContain('localhost:8000');
    expect(suggestions.some((s) => s.includes('prev-api-examance'))).toBe(true);
    expect(suggestions.some((s) => s.includes('api-examance'))).toBe(true);
  });
});
