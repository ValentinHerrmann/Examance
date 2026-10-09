/**
 * Answers the app's API from the in-memory fake (`tests/helpers/fakeApi.ts`), so no backend runs. Calls from :4173 to
 * :8000 are cross-origin with credentials, so responses carry the real CORS headers and preflights are answered here.
 * Routed on the browser context so it survives reloads and new pages; never touches the app's CSP.
 */
import type { BrowserContext, Route } from '@playwright/test';
import type { FakeApi } from '../../tests/helpers/fakeApi';

/** Default dev backend; the fake answers for it. */
export const BACKEND_ORIGIN = 'http://localhost:8000';
const API_PREFIX = '/api/v1';
/** What the app's version probe (`GET /api/health`) reads; the dev build is `0.0.0-dev`, same major. */
const HEALTH_BODY = { version: '0.0.0' };

function corsHeaders(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type',
    // The client reads the machine-readable error code and the login cooloff from these.
    'access-control-expose-headers': 'code, retry-after',
    vary: 'origin',
  };
}

/** JSON body the client sent, or undefined when there is none (or it is not JSON, e.g. binary). */
function requestBody(route: Route): unknown {
  try {
    return route.request().postDataJSON() ?? undefined;
  } catch {
    return undefined;
  }
}

async function answer(route: Route, api: FakeApi): Promise<void> {
  const request = route.request();
  const origin = request.headers()['origin'] ?? 'http://localhost:4173';
  const cors = corsHeaders(origin);
  const url = new URL(request.url());
  const method = request.method();

  if (method === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: cors });
    return;
  }

  if (url.pathname === '/api/health') {
    await route.fulfill({ status: 200, headers: cors, json: HEALTH_BODY });
    return;
  }

  if (!url.pathname.startsWith(`${API_PREFIX}/`)) {
    api.state.unhandled.push(`${method} ${url.pathname}${url.search}`);
    await route.fulfill({ status: 404, headers: cors, json: { detail: 'Not an API path' } });
    return;
  }

  const res = api.handle(method, `${url.pathname.slice(API_PREFIX.length)}${url.search}`, requestBody(route));
  const headers = { ...cors, ...res.headers };
  if (res.bytes) {
    await route.fulfill({ status: res.status, headers, body: Buffer.from(res.bytes) });
  } else if (res.body === undefined) {
    await route.fulfill({ status: res.status, headers });
  } else {
    await route.fulfill({ status: res.status, headers, json: res.body });
  }
}

/** Serve `api` for everything the browser context requests from the default backend. */
export async function installFakeBackend(context: BrowserContext, api: FakeApi): Promise<void> {
  await context.route(`${BACKEND_ORIGIN}/**`, (route) => answer(route, api));
}
