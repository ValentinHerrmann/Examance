import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxyRequest } from '../functions/api/[[path]].js';

const ENV = { BACKEND_ORIGIN: 'https://origin.example.org', BACKEND_PROXY_SECRET: 's3cret' };

function forwarded(): Request {
  const fetchMock = vi.mocked(globalThis.fetch);
  return fetchMock.mock.calls[0][0] as Request;
}

describe('Pages Function API proxy (issue #198)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('forwards path and query to the backend origin with the proxy secret and client IP', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    await proxyRequest(
      new Request('https://examance.de/api/v1/exams?limit=5', { headers: { 'CF-Connecting-IP': '198.51.100.7' } }),
      ENV,
    );
    const req = forwarded();
    expect(req.url).toBe('https://origin.example.org/api/v1/exams?limit=5');
    expect(req.headers.get('X-Examance-Proxy-Secret')).toBe('s3cret');
    expect(req.headers.get('X-Examance-Client-IP')).toBe('198.51.100.7');
    expect(req.redirect).toBe('manual');
  });

  it('never passes on a secret or client IP the browser sent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    await proxyRequest(
      new Request('https://examance.de/api/health', {
        headers: { 'X-Examance-Proxy-Secret': 'guess', 'X-Examance-Client-IP': '10.0.0.1' },
      }),
      { BACKEND_ORIGIN: ENV.BACKEND_ORIGIN },
    );
    const req = forwarded();
    expect(req.headers.get('X-Examance-Proxy-Secret')).toBeNull();
    expect(req.headers.get('X-Examance-Client-IP')).toBeNull();
  });

  it('answers 502 without a backend origin instead of calling anything', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await proxyRequest(new Request('https://examance.de/api/health'), {});
    expect(res.status).toBe(502);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
