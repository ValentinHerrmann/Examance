import { describe, expect, it } from 'vitest';
import { onRequest } from '../functions/_app/immutable/[[path]].js';

// A missing build file used to come back as index.html with a one-year cache, poisoning browser and edge caches.
function run(url: string, asset: Response): Promise<Response> {
  return onRequest({ request: new Request(url), env: { ASSETS: { fetch: async () => asset } } });
}

describe('Pages guard for /_app/immutable/*', () => {
  it('answers the SPA fallback page with an uncached 404', async () => {
    const res = await run('https://x.test/_app/immutable/chunks/gone.js', new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('passes a real script through with the long cache', async () => {
    const res = await run('https://x.test/_app/immutable/chunks/a.js', new Response('export {}', { headers: { 'Content-Type': 'application/javascript' } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await res.text()).toBe('export {}');
  });

  it('sets the module and wasm content types', async () => {
    const mjs = await run('https://x.test/_app/immutable/assets/w.mjs', new Response('x', { headers: { 'Content-Type': 'application/octet-stream' } }));
    const wasm = await run('https://x.test/_app/immutable/assets/w.wasm', new Response('x', { headers: { 'Content-Type': 'application/octet-stream' } }));
    expect(mjs.headers.get('content-type')).toBe('text/javascript');
    expect(wasm.headers.get('content-type')).toBe('application/wasm');
  });

  it('keeps a 304 revalidation as is', async () => {
    const res = await run('https://x.test/_app/immutable/chunks/a.js', new Response(null, { status: 304 }));
    expect(res.status).toBe(304);
  });
});
