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
import { translate, translateOptional } from '$lib/i18n';
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
    let detailStr = translate('errors.unknown');
    if (typeof body.detail === 'string') {
      detailStr = body.detail;
    } else if (body.detail !== undefined && body.detail !== null) {
      detailStr = JSON.stringify(body.detail);
    } else if (body.message) {
      detailStr = String(body.message);
    }
    const code = body.code ?? 'ERR_UNKNOWN';
    // The backend ships an English `detail` next to a machine-readable `code`.
    // Prefer a localized message for known codes and keep the server text as
    // the fallback so unmapped errors stay diagnosable.
    return new ApiError(response.status, code, translateOptional(`errors.code.${code}`) ?? detailStr);
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
    throw new ApiError(0, 'ERR_NETWORK', err?.message || translate('errors.network'));
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

  let resp: Response;
  try {
    resp = await fetch(`${getBaseUrl()}${path}`, {
      method,
      headers,
      body: bodyInit,
      credentials: 'include', // Always include httpOnly cookies
    });
  } catch (err: any) {
    // fetch only rejects when no usable response arrived at all: the server is
    // unreachable, or it answered without the CORS headers the browser needs
    // (which is what an unhandled server error used to look like from here).
    const netErr = new ApiError(
      0,
      'ERR_NETWORK',
      'No response from the server. It may be unreachable, or it rejected the request before answering.'
    );
    if (!options.silentError) {
      httpErrorStore.showError(netErr.status, netErr.message, netErr.code);
    }
    throw netErr;
  }

  if (resp.status === 401 && !path.startsWith('/auth/')) {
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
        httpErrorStore.showError(
          status,
          err?.message || translate('errors.unauthorized'),
          err?.code || 'ERR_UNAUTHORIZED'
        );
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
  get: <T>(path: string, options?: { silentError?: boolean }) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: { silentError?: boolean }) => request<T>('POST', path, body, options),
  patch: <T>(path: string, body: unknown, options?: { silentError?: boolean }) => request<T>('PATCH', path, body, options),
  delete: <T>(path: string, options?: { silentError?: boolean }) => request<T>('DELETE', path, undefined, options),
  postBinary: (path: string, data: Uint8Array) =>
    request<ArrayBuffer>('POST', path, data, { binary: true }),
  postJsonForBinary: (path: string, body: unknown, options?: { silentError?: boolean }) =>
    request<ArrayBuffer>('POST', path, body, { ...options, binary: true }),
  getBinary: (path: string, options?: { silentError?: boolean }) =>
    request<ArrayBuffer>('GET', path, undefined, { ...options, binary: true }),
};
