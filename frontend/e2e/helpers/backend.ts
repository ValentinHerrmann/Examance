/** Answers the app's API from the in-memory fake (`tests/helpers/fakeApi.ts`), so no backend runs. The API is same-origin (`/api` on the app's own host, issue #198), so there is no CORS to imitate. Routed on the browser context so it survives reloads and new pages; never touches the app's CSP. */
import type { BrowserContext, Route } from '@playwright/test';
import type { FakeApi } from '../../tests/helpers/fakeApi';

const API_PREFIX = '/api/v1';
/** What the app's version probe (`GET /api/health`) reads; the dev build is `0.0.0-dev`, same major. */
const HEALTH_BODY = { version: '0.0.0' };

/** API paths only: Vite also serves modules such as `/src/lib/api/client.ts`, which must still load. */
function isApiPath(url: URL): boolean {
  return url.pathname === '/api/health' || url.pathname.startsWith(`${API_PREFIX}/`);
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
  const url = new URL(request.url());
  const method = request.method();

  if (url.pathname === '/api/health') {
    await route.fulfill({ status: 200, json: HEALTH_BODY });
    return;
  }

  const res = api.handle(method, `${url.pathname.slice(API_PREFIX.length)}${url.search}`, requestBody(route));
  const headers = res.headers;
  if (res.bytes) {
    await route.fulfill({ status: res.status, headers, body: Buffer.from(res.bytes) });
  } else if (res.body === undefined) {
    await route.fulfill({ status: res.status, headers });
  } else {
    await route.fulfill({ status: res.status, headers, json: res.body });
  }
}

/** Serve `api` for every API request of the browser context. */
export async function installFakeBackend(context: BrowserContext, api: FakeApi): Promise<void> {
  await context.route(isApiPath, (route) => answer(route, api));
}
