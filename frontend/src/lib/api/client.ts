/**
 * Typed API fetch wrapper. SECURITY: `credentials: 'include'` on every request (httpOnly
 * cookies); the access token is never read or stored in JS. 401 -> silent refresh via
 * POST /api/v1/auth/refresh; refresh failure -> redirect to /unlock.
 */

import { get } from 'svelte/store';
import { sessionStore } from '#lib/stores/session';
import { translate, translateOptional } from '#lib/i18n';
import { backendStore } from '#lib/stores/backendStore';
import { httpErrorStore } from '#lib/stores/httpErrorStore';
import { loginLockout } from '#lib/stores/loginLockout';

// Every fetch() is bounded: a stalled connection would otherwise never resolve or reject,
// leaving isLoading stuck with no error. Binary requests get a longer bound because
// `/compile/latex` legitimately runs up to COMPILE_TIMEOUT_SECONDS (120s, backend/app/services/latex.py).
const DEFAULT_TIMEOUT_MS = 25_000;
const BINARY_TIMEOUT_MS = 150_000;

function withTimeoutSignal(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

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
    message: string,
    /** Seconds until retry, from `Retry-After`. Only set on a 429 (login cooloff lasts one minute to an hour). */
    public retryAfterSeconds: number | null = null
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The server's message for an API error, else the given fallback text. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/** `Retry-After` in seconds, or null when absent or not a plain count. */
function parseRetryAfter(response: Response): number | null {
  const raw = response.headers.get('Retry-After');
  if (!raw) {
    return null;
  }
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
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
    // The backend attaches the code as a response *header*, not in the body
    // (see the HTTPException(headers={'code': ...}) calls across the routers).
    // The body is checked first so a future JSON-carried code still wins.
    const code = body.code ?? response.headers.get('code') ?? 'ERR_UNKNOWN';
    // The backend ships an English `detail` next to a machine-readable `code`.
    // Prefer a localized message for known codes and keep the server text as
    // the fallback so unmapped errors stay diagnosable.
    return new ApiError(
      response.status,
      code,
      translateOptional(`errors.code.${code}`) ?? detailStr,
      parseRetryAfter(response),
    );
  } catch {
    // No JSON body (or unparseable) — the header may still carry the code.
    const headerCode = response.headers.get('code') ?? 'ERR_UNKNOWN';
    return new ApiError(
      response.status,
      headerCode,
      translateOptional(`errors.code.${headerCode}`) ?? response.statusText,
      parseRetryAfter(response),
    );
  }
}

let refreshPromise: Promise<void> | null = null;
let lastRefreshAt = 0;

/**
 * A 401 this soon after a successful refresh means the request raced the rotation, so retry it
 * rather than refresh again: POST /auth/refresh treats a second use of a revoked refresh token
 * as theft and revokes the whole family (logs the user out).
 */
const REFRESH_GRACE_MS = 5000;

/**
 * Rotate the refresh cookie once for every concurrent caller in this tab. Tabs share the cookie,
 * so the rotation runs under a cross-tab lock: a waiting tab then sends the new token, not the revoked one.
 */
export function refreshSession(): Promise<void> {
  if (!refreshPromise) {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    const run = locks ? locks.request('examance-auth-refresh', () => refreshToken()) : refreshToken();
    refreshPromise = run.finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function refreshToken(): Promise<void> {
  const { signal, cancel } = withTimeoutSignal(DEFAULT_TIMEOUT_MS);
  try {
    const resp = await fetch(`${getBaseUrl()}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      signal,
    });
    if (!resp.ok) {
      const err = await parseError(resp);
      throw err;
    }
    lastRefreshAt = Date.now();
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, 'ERR_NETWORK', err?.message || translate('errors.network'));
  } finally {
    cancel();
  }
}

async function handleNonOkResponse(resp: Response, silentError?: boolean): Promise<never> {
  const err = await parseError(resp);
  if (err.status === 429 && err.retryAfterSeconds !== null) {
    // Keyed on status, not ERR_ACCOUNT_LOCKED, so the IP-based limiter (429 with Retry-After but
    // no `code` header, surfacing as ERR_UNKNOWN) is covered too. Set even for silent callers:
    // this is page state, not a dialog.
    loginLockout.start(err.retryAfterSeconds);
  }
  if (!silentError) {
    httpErrorStore.showError(err.status, err.message, err.code);
  }
  throw err;
}

/**
 * A factor was accepted, so the server cleared the cooloff; drop ours. Scoped to auth paths:
 * an unrelated success (e.g. a health poll) says nothing about the account's lock state.
 */
function noteAuthSuccess(path: string): void {
  // Registration and account deletion prove nothing about signing in, so they must not lift a lockout.
  if (path.startsWith('/auth/') && !path.startsWith('/auth/register') && !path.startsWith('/auth/account-deletion')) {
    loginLockout.clear();
  }
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

  const timeoutMs = options.binary ? BINARY_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;

  // Used for the first attempt and the retry after a refresh alike, so both fail as ERR_NETWORK.
  const send = async (): Promise<Response> => {
    const { signal, cancel } = withTimeoutSignal(timeoutMs);
    try {
      return await fetch(`${getBaseUrl()}${path}`, {
        method,
        headers,
        body: bodyInit,
        credentials: 'include', // Always include httpOnly cookies
        signal,
      });
    } catch (err: any) {
      // fetch rejects when no usable response arrived: server unreachable, a response without the
      // CORS headers, or a timeout (AbortError, indistinguishable from a never-resolving stall).
      const netErr = new ApiError(
        0,
        'ERR_NETWORK',
        'No response from the server. It may be unreachable, or it rejected the request before answering.'
      );
      if (!options.silentError) {
        httpErrorStore.showError(netErr.status, netErr.message, netErr.code);
      }
      throw netErr;
    } finally {
      cancel();
    }
  };

  const resp = await send();

  if (resp.status === 403 && resp.headers.get('code') === 'ERR_MFA_ENROLLMENT_REQUIRED') {
    // The account no longer satisfies the two-factor policy (e.g. an admin reset its factors): lock and send the
    // teacher to /unlock to enroll. Must come before the 401 branch (a refresh would rotate a valid token for nothing).
    // Skipped on /unlock itself, where enrollment runs: locking mid-flow would wipe sessionStorage and broadcast SESSION_LOCKED.
    const onUnlockPage =
      typeof window !== 'undefined' && window.location.pathname.startsWith('/unlock');
    if (!onUnlockPage) {
      sessionStore.lock();
      if (typeof window !== 'undefined') {
        window.location.assign('/unlock');
      }
    }
    await handleNonOkResponse(resp, true);
  }

  if (resp.status === 401 && !path.startsWith('/auth/')) {
    // Deduplicate concurrent refreshes. A request that 401'd by racing a just-finished refresh
    // retries directly; a second rotation would trip token-theft detection and revoke every session.
    if (!refreshPromise && Date.now() - lastRefreshAt >= REFRESH_GRACE_MS) {
      void refreshSession().catch(() => {});
    }
    try {
      if (refreshPromise) await refreshPromise;
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
    const retryResp = await send();
    if (!retryResp.ok) {
      await handleNonOkResponse(retryResp, options.silentError);
    }
    noteAuthSuccess(path);
    if (retryResp.status === 204) return undefined as T;
    if (options.binary) return retryResp.arrayBuffer() as unknown as T;
    return retryResp.json() as Promise<T>;
  }

  if (!resp.ok) {
    await handleNonOkResponse(resp, options.silentError);
  }

  noteAuthSuccess(path);
  if (resp.status === 204) return undefined as T;
  if (options.binary) return resp.arrayBuffer() as unknown as T;
  return resp.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, options?: { silentError?: boolean }) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: { silentError?: boolean }) => request<T>('POST', path, body, options),
  patch: <T>(path: string, body: unknown, options?: { silentError?: boolean }) => request<T>('PATCH', path, body, options),
  put: <T>(path: string, body: unknown, options?: { silentError?: boolean }) => request<T>('PUT', path, body, options),
  delete: <T>(path: string, options?: { silentError?: boolean }) => request<T>('DELETE', path, undefined, options),
  postBinary: (path: string, data: Uint8Array) =>
    request<ArrayBuffer>('POST', path, data, { binary: true }),
  postJsonForBinary: (path: string, body: unknown, options?: { silentError?: boolean }) =>
    request<ArrayBuffer>('POST', path, body, { ...options, binary: true }),
  getBinary: (path: string, options?: { silentError?: boolean }) =>
    request<ArrayBuffer>('GET', path, undefined, { ...options, binary: true }),
};
