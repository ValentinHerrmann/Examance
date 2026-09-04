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
import { loginLockout } from '$lib/stores/loginLockout';

// Every fetch() below is bounded. Without this, a stalled connection (a
// mobile network hiccup, a backend that accepts the connection but never
// answers) left `fetch` neither resolving nor rejecting — the caller's
// isLoading flag never cleared and no error ever surfaced, so the UI just
// sat there looking like it was still working. `/compile/latex` legitimately
// runs up to the backend's own COMPILE_TIMEOUT_SECONDS (120s,
// backend/app/services/latex.py) — binary requests get a longer bound so a
// real compile is never mistaken for a hang.
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
    /**
     * Seconds until the request would be accepted again, from `Retry-After`.
     *
     * Only ever set on a 429. The login cooloff runs from one minute to an
     * hour depending on how many attempts preceded it, so "try again later"
     * without this number is not an answer.
     */
    public retryAfterSeconds: number | null = null
  ) {
    super(message);
    this.name = 'ApiError';
  }
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
 * How long after a successful refresh a fresh 401 is treated as "this request
 * was already in flight with the old access cookie" rather than "the session is
 * gone". POST /auth/refresh rotates the refresh token and treats a *second* use
 * of an already-revoked one as token theft — it then revokes the whole family,
 * logging the user out. Requests that raced the rotation must therefore retry,
 * never refresh again.
 */
const REFRESH_GRACE_MS = 5000;

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
    // Keyed on the status rather than on ERR_ACCOUNT_LOCKED so the IP-based
    // limiter is covered too: its 429 carries a Retry-After but no `code`
    // header, and surfaces as a bare ERR_UNKNOWN.
    //
    // Set even when the caller asked for silence — this is state the page
    // renders for itself, not a dialog to suppress.
    loginLockout.start(err.retryAfterSeconds);
  }
  if (!silentError) {
    httpErrorStore.showError(err.status, err.message, err.code);
  }
  throw err;
}

/**
 * A factor was accepted, so the server has cleared the cooloff — drop ours too.
 *
 * Scoped to the auth paths on purpose: an unrelated request succeeding (a health
 * poll, say) says nothing about whether this account is still locked.
 */
function noteAuthSuccess(path: string): void {
  if (path.startsWith('/auth/')) {
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

  let resp: Response;
  {
    const { signal, cancel } = withTimeoutSignal(timeoutMs);
    try {
      resp = await fetch(`${getBaseUrl()}${path}`, {
        method,
        headers,
        body: bodyInit,
        credentials: 'include', // Always include httpOnly cookies
        signal,
      });
    } catch (err: any) {
      // fetch rejects when no usable response arrived at all: the server is
      // unreachable, it answered without the CORS headers the browser needs
      // (what an unhandled server error used to look like from here), or the
      // request timed out (AbortError) — a stalled connection is otherwise
      // indistinguishable from one that will never resolve, so it gets the
      // same message.
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
  }

  if (resp.status === 403 && resp.headers.get('code') === 'ERR_MFA_ENROLLMENT_REQUIRED') {
    // The session is real but the account no longer satisfies the two-factor
    // policy — an administrator reset its factors, say. There is nothing to
    // refresh: the token is correct, the account is not. Lock and send the
    // teacher back to sign in, where enrollment happens.
    //
    // Deliberately *before* the 401 branch below: entering the refresh path
    // here would rotate a perfectly valid refresh token to no purpose.
    // Not while the teacher is already on /unlock: enrollment runs there, and
    // the enrollment scope is *expected* to be rejected by everything else.
    // Locking mid-flow wipes sessionStorage and broadcasts SESSION_LOCKED to
    // every other tab over a 403 that is doing its job.
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
    // Deduplicate concurrent refresh attempts. A request that 401'd because it
    // raced a refresh that has just succeeded is retried straight away — asking
    // for a second rotation would trip the backend's token-theft detection and
    // revoke every session this teacher has.
    if (!refreshPromise && Date.now() - lastRefreshAt >= REFRESH_GRACE_MS) {
      refreshPromise = refreshToken().finally(() => {
        refreshPromise = null;
      });
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
    const retry = withTimeoutSignal(timeoutMs);
    let retryResp: Response;
    try {
      retryResp = await fetch(`${getBaseUrl()}${path}`, {
        method,
        headers,
        body: bodyInit,
        credentials: 'include',
        signal: retry.signal,
      });
    } finally {
      retry.cancel();
    }
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
