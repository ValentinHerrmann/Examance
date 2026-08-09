/**
 * Typed API fetch wrapper.
 *
 * SECURITY:
 * - credentials: 'include' on EVERY request — sends httpOnly cookies automatically.
 * - Never reads or stores the access token in JavaScript.
 * - On 401: attempts silent refresh via POST /api/v1/auth/refresh.
 * - On refresh failure: redirects to /unlock (login) page.
 */

import { get } from 'svelte/store';
import { sessionStore } from '$lib/stores/session';
import { backendStore } from '$lib/stores/backendStore';
import { httpErrorStore } from '$lib/stores/httpErrorStore';

function getBaseUrl(): string {
  const url = get(backendStore);
  if (!url) {
    throw new ApiError(0, 'ERR_NO_SERVER_URL', 'Backend server address is not configured. Please enter a server address.');
  }
  return `${url.replace(/\/$/, '')}/api/v1`;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = await response.json();
    let detailStr = 'Unknown error';
    if (typeof body.detail === 'string') {
      detailStr = body.detail;
    } else if (body.detail !== undefined && body.detail !== null) {
      detailStr = JSON.stringify(body.detail);
    } else if (body.message) {
      detailStr = String(body.message);
    }
    return new ApiError(response.status, body.code ?? 'ERR_UNKNOWN', detailStr);
  } catch {
    return new ApiError(response.status, 'ERR_UNKNOWN', response.statusText);
  }
}

let refreshPromise: Promise<void> | null = null;

async function refreshToken(): Promise<void> {
  try {
    const resp = await fetch(`${getBaseUrl()}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!resp.ok) {
      const err = await parseError(resp);
      throw err;
    }
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, 'ERR_NETWORK', err?.message || 'Server unreachable');
  }
}

async function handleNonOkResponse(resp: Response, silentError?: boolean): Promise<never> {
  const err = await parseError(resp);
  if (!silentError) {
    httpErrorStore.showError(err.status, err.message, err.code);
  }
  throw err;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: { binary?: boolean; silentError?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  let bodyInit: BodyInit | undefined;

  if (body !== undefined) {
    if (body instanceof Uint8Array || body instanceof ArrayBuffer) {
      headers['Content-Type'] = 'application/octet-stream';
      bodyInit = body as BodyInit;
    } else {
      headers['Content-Type'] = 'application/json';
      bodyInit = JSON.stringify(body);
    }
  }

  const resp = await fetch(`${getBaseUrl()}${path}`, {
    method,
    headers,
    body: bodyInit,
    credentials: 'include', // Always include httpOnly cookies
  });

  if (resp.status === 401) {
    // Deduplicate concurrent refresh attempts
    if (!refreshPromise) {
      refreshPromise = refreshToken().finally(() => {
        refreshPromise = null;
      });
    }
    try {
      await refreshPromise;
    } catch (err: any) {
      if (!options.silentError) {
        const status = err instanceof ApiError && err.status ? err.status : 401;
        httpErrorStore.showError(status, err?.message || 'Unauthorized', err?.code || 'ERR_UNAUTHORIZED');
      }
      throw err;
    }

    // Retry original request after refresh
    const retryResp = await fetch(`${getBaseUrl()}${path}`, {
      method,
      headers,
      body: bodyInit,
      credentials: 'include',
    });
    if (!retryResp.ok) {
      await handleNonOkResponse(retryResp, options.silentError);
    }
    if (options.binary) return retryResp.arrayBuffer() as unknown as T;
    return retryResp.json() as Promise<T>;
  }

  if (!resp.ok) {
    await handleNonOkResponse(resp, options.silentError);
  }

  if (resp.status === 204) return undefined as T;
  if (options.binary) return resp.arrayBuffer() as unknown as T;
  return resp.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  postBinary: (path: string, data: Uint8Array) =>
    request<ArrayBuffer>('POST', path, data, { binary: true }),
  postJsonForBinary: (path: string, body: unknown) =>
    request<ArrayBuffer>('POST', path, body, { binary: true }),
  getBinary: (path: string) => request<ArrayBuffer>('GET', path, undefined, { binary: true }),
};
