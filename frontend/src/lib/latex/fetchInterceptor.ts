/**
 * Fetch interceptor for BusyTeX chunked asset resolution.
 * Automatically decompresses gzipped chunks or joins split files.
 */
function getGlobalScope(): any {
  if (typeof window !== 'undefined') return window;
  if (typeof self !== 'undefined') return self;
  return globalThis;
}

const globalScope = getGlobalScope();

if (!globalScope.__busytex_fetch_intercepted__) {
  globalScope.__busytex_fetch_intercepted__ = true;

  const originalFetch = globalScope.fetch;
  let chunkManifestPromise: Promise<Record<string, any>> | null = null;

  function getChunkManifest(): Promise<Record<string, any>> {
    if (!chunkManifestPromise) {
      chunkManifestPromise = originalFetch('/core/busytex/chunk-manifest.json')
        .then(async (res: Response) => {
          if (res.ok) {
            try {
              return await res.json();
            } catch {
              return {};
            }
          }
          return {};
        })
        .catch(() => ({}));
    }
    return chunkManifestPromise!;
  }

  function getTargetUrl(target: any): string {
    if (typeof target === 'string') return target;
    if (target && typeof target === 'object' && 'url' in target) {
      return target.url;
    }
    return String(target);
  }

  function getContentType(pathname: string, fallbackHeader: string | null): string {
    if (pathname.endsWith('.wasm')) return 'application/wasm';
    if (pathname.endsWith('.js')) return 'application/javascript';
    return fallbackHeader || 'application/octet-stream';
  }

  /**
   * Builds a ReadableStream that concatenates the bodies of `responses` in
   * order while counting the raw (pre-decompression) bytes seen. If the
   * manifest declares an expected size and the actual byte count doesn't
   * match once every response body is drained, the stream is errored
   * instead of closed. This turns a silently truncated/corrupted chunk
   * download (e.g. a flaky connection or a stale/short CDN cache entry)
   * into a hard, visible failure instead of a partially-mounted virtual
   * filesystem downstream (busytex compiling with spurious "File `X.sty'
   * not found" errors for packages that are actually bundled, because the
   * archive containing them got cut off mid-download).
   */
  function createVerifiedStream(
    responses: Response[],
    expectedSize: number | undefined,
    describeSource: string
  ): ReadableStream<any> {
    return new ReadableStream<any>({
      async start(controller) {
        let received = 0;
        try {
          for (const res of responses) {
            if (!res.body) continue;
            const reader = res.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              received += value.byteLength;
              controller.enqueue(value);
            }
          }

          if (typeof expectedSize === 'number' && expectedSize > 0 && received !== expectedSize) {
            controller.error(
              new Error(
                `Incomplete download for ${describeSource}: received ${received} bytes, expected ${expectedSize} bytes. ` +
                  `The cached or downloaded asset is truncated/corrupted.`
              )
            );
            return;
          }

          controller.close();
        } catch (err) {
          controller.error(err);
        }
      }
    });
  }

  async function handleSingleChunk(
    chunkUrl: string,
    pathname: string,
    entry: any,
    init?: RequestInit
  ): Promise<Response | null> {
    const response = await originalFetch(chunkUrl, init);
    if (!response.ok) return null;

    const verifiedStream = createVerifiedStream([response], entry.gzippedSize, pathname);
    let body: ReadableStream<any> = verifiedStream;
    if (entry.gzipped && typeof DecompressionStream !== 'undefined') {
      body = verifiedStream.pipeThrough(new DecompressionStream('gzip'));
    }

    const contentType = getContentType(pathname, response.headers.get('content-type'));
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.set('Content-Type', contentType);

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  async function handleMultipleChunks(
    chunks: string[],
    pathname: string,
    entry: any,
    init?: RequestInit
  ): Promise<Response | null> {
    const responses = await Promise.all(chunks.map((url) => originalFetch(url, init)));
    if (!responses.every((r) => r.ok)) {
      throw new Error(`Failed to fetch one or more chunks for ${pathname}`);
    }

    const combinedStream = createVerifiedStream(responses, entry.gzippedSize, pathname);

    let body: ReadableStream<any> = combinedStream;
    if (entry.gzipped && typeof DecompressionStream !== 'undefined') {
      body = combinedStream.pipeThrough(new DecompressionStream('gzip'));
    }

    const contentType = getContentType(pathname, responses[0].headers.get('content-type'));
    return new Response(body, {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': contentType }
    });
  }

  globalScope.fetch = async function (...args: any[]): Promise<Response> {
    const requestTarget = args[0];
    const urlStr = getTargetUrl(requestTarget);

    try {
      const baseHref = globalScope.location ? globalScope.location.href : 'http://localhost';
      const parsedUrl = new URL(urlStr, baseHref);
      const pathname = parsedUrl.pathname;
      const manifest = await getChunkManifest();

      const entry = manifest[pathname];
      if (entry?.chunks?.length) {
        if (entry.chunks.length === 1) {
          const res = await handleSingleChunk(entry.chunks[0], pathname, entry, args[1]);
          if (res) return res;
        } else {
          const res = await handleMultipleChunks(entry.chunks, pathname, entry, args[1]);
          if (res) return res;
        }
      }

      const res = await originalFetch(...args);
      if (res.ok && (pathname.endsWith('.wasm') || pathname.endsWith('.wasm.bin'))) {
        const headers = new Headers(res.headers);
        headers.set('Content-Type', 'application/wasm');
        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers
        });
      }
      return res;
    } catch {
      // On error, fall back to originalFetch
    }

    return originalFetch(...args);
  };
}

export {};
