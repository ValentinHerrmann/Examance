import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiOrigin, apiUrl, originOf } from '../src/lib/api/origin';

function at(href: string): void {
  const url = new URL(href);
  vi.stubGlobal('location', { hostname: url.hostname, host: url.host, protocol: url.protocol, origin: url.origin });
}

describe('apiOrigin (issue #198)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('stays on this origin on a loopback frontend, where Vite proxies /api', () => {
    at('http://localhost:5173/exams');
    expect(apiOrigin()).toBe('');
    expect(apiUrl('/api/health')).toBe('/api/health');
    at('http://127.0.0.1:4173/');
    expect(apiOrigin()).toBe('');
  });

  it('defaults to api.<frontend host>, which shares the site and so the SameSite=Strict cookies', () => {
    at('https://examance.example.org/unlock');
    expect(apiOrigin()).toBe('https://api.examance.example.org');
    expect(apiUrl('/api/v1/exams')).toBe('https://api.examance.example.org/api/v1/exams');
  });

  it('reduces a configured URL to its origin and ignores unusable ones', () => {
    expect(originOf('https://api.example.org/some/path/')).toBe('https://api.example.org');
    expect(originOf('not a url')).toBe('');
    expect(originOf('')).toBe('');
  });
});
