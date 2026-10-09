import { afterEach, describe, expect, it, vi } from 'vitest';
import { readable } from 'svelte/store';

vi.mock('../src/lib/stores/backendStore', () => ({ backendStore: readable('https://api.test') }));

import { api, ApiError } from '../src/lib/api/client';

describe('api client retry after a token refresh', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('reports a network failure of the retry as ERR_NETWORK, like the first attempt', async () => {
    // 401 -> refresh succeeds -> the retried request never gets a response.
    const mockFetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) return new Response(null, { status: 200 });
      if (mockFetch.mock.calls.filter(([c]) => String(c) === u).length === 1) {
        return new Response(JSON.stringify({ detail: 'expired' }), { status: 401 });
      }
      throw new TypeError('Failed to fetch');
    });
    globalThis.fetch = mockFetch as typeof fetch;

    const err = await api.get('/exams', { silentError: true }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('ERR_NETWORK');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
