// Cloudflare Pages Function (issue #198): serves the API at this site's own /api by forwarding to the backend origin, so the browser never talks to another host. Pages variables: BACKEND_ORIGIN (e.g. https://api.examance.de) and BACKEND_PROXY_SECRET (= the backend's PROXY_SHARED_SECRET). Self-hosting without Pages uses a reverse proxy instead (docs/hosting.md).

/** @typedef {{ BACKEND_ORIGIN?: string, BACKEND_PROXY_SECRET?: string }} ProxyEnv */

const SECRET_HEADER = 'X-Examance-Proxy-Secret';
const CLIENT_IP_HEADER = 'X-Examance-Client-IP';

/**
 * Forward one request to the backend; exported for tests.
 * @param {Request} request
 * @param {ProxyEnv} env
 * @returns {Promise<Response>}
 */
export async function proxyRequest(request, env) {
  if (!env.BACKEND_ORIGIN) {
    return Response.json({ detail: 'The API is not configured.', code: 'ERR_PROXY_UNCONFIGURED' }, { status: 502 });
  }
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, env.BACKEND_ORIGIN);

  const headers = new Headers(request.headers);
  // Only this proxy may speak for the client: anything a browser sent under these names is dropped.
  headers.delete(SECRET_HEADER);
  headers.delete(CLIENT_IP_HEADER);
  if (env.BACKEND_PROXY_SECRET) headers.set(SECRET_HEADER, env.BACKEND_PROXY_SECRET);
  const clientIp = request.headers.get('CF-Connecting-IP');
  if (clientIp) headers.set(CLIENT_IP_HEADER, clientIp);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  /** @type {RequestInit & { duplex?: 'half' }} */
  const init = {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    // Redirects reach the browser as they are; following them here would re-target credentials.
    redirect: 'manual',
  };
  if (hasBody) init.duplex = 'half';
  return fetch(new Request(target, init));
}

/** @param {{ request: Request, env: ProxyEnv }} context */
export function onRequest(context) {
  return proxyRequest(context.request, context.env);
}
