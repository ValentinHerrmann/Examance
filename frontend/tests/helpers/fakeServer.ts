/**
 * A tiny in-memory backend for tests that need exams and exercises, which always live on the
 * server since local mode was discontinued (issue #47). It is `fakeApi.ts` (shared with the
 * Playwright suite) behind a mock of `lib/api/client`; anything the fake has no route for answers
 * 404. Install it in a test file with:
 *
 *   vi.mock('../src/lib/api/client', async () => (await import('./helpers/fakeServer')).clientModule);
 *
 * Responses are snake_case, like the real API, so the repositories' mappers run unchanged.
 */

import { createFakeApi, type FakeResponse } from './fakeApi';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfterSeconds: number | null = null
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const fake = createFakeApi();

export const fakeServer = {
  state: fake.state,
  reset: fake.reset,
};

function answer(method: string, path: string, body?: unknown): FakeResponse {
  const res = fake.handle(method, path, body);
  if (res.status >= 400) {
    const detail = (res.body as { detail?: string } | undefined)?.detail ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, res.headers?.code ?? 'ERR_UNKNOWN', detail);
  }
  return res;
}

async function request(method: string, path: string, body?: unknown): Promise<any> {
  return answer(method, path, body).body;
}

async function requestBinary(method: string, path: string, body?: unknown): Promise<ArrayBuffer> {
  const bytes = answer(method, path, body).bytes ?? new Uint8Array();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Drop-in replacement for `src/lib/api/client`'s exports. */
export const clientModule = {
  ApiError,
  api: {
    get: (path: string) => request('GET', path),
    post: (path: string, body?: unknown) => request('POST', path, body),
    put: (path: string, body?: unknown) => request('PUT', path, body),
    patch: (path: string, body?: unknown) => request('PATCH', path, body),
    delete: (path: string) => request('DELETE', path),
    getBinary: (path: string) => requestBinary('GET', path),
  },
};
