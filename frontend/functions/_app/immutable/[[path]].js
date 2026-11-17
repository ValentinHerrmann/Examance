// Cloudflare Pages Function for /_app/immutable/* only: a missing build file must answer 404 "no-store", never the SPA fallback page under a one-year cache (docs/dev/build_and_csp.md).
// Pages does not apply _headers to Function responses, so the long cache and the content types of static/_headers are set here for real files.

const IMMUTABLE = 'public, max-age=31536000, immutable';
/** @type {Record<string, string>} */
const TYPES = { '.mjs': 'text/javascript', '.wasm': 'application/wasm' };

/** @param {{ request: Request, env: { ASSETS: { fetch: (r: Request) => Promise<Response> } } }} context */
export async function onRequest({ request, env }) {
  const asset = await env.ASSETS.fetch(request);
  if (asset.status === 304) return asset;
  const type = asset.headers.get('content-type') ?? '';
  if (!asset.ok || type.startsWith('text/html')) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  const response = new Response(asset.body, asset);
  response.headers.set('Cache-Control', IMMUTABLE);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  const path = new URL(request.url).pathname;
  const ext = Object.keys(TYPES).find((e) => path.endsWith(e));
  if (ext) response.headers.set('Content-Type', TYPES[ext]);
  return response;
}
