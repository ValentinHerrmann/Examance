// @ts-nocheck
(function () {
  const globalScope = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis);
  if (globalScope.__busytex_fetch_intercepted__) return;
  globalScope.__busytex_fetch_intercepted__ = true;

  const originalFetch = globalScope.fetch;
  let chunkManifestPromise = null;

  function getChunkManifest() {
    if (!chunkManifestPromise) {
      chunkManifestPromise = originalFetch('/core/busytex/chunk-manifest.json')
        .then(async (res) => {
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
    return chunkManifestPromise;
  }

  // Builds a ReadableStream that concatenates the bodies of `responses` in
  // order while counting the raw (pre-decompression) bytes seen. If the
  // manifest declares an expected size and the actual byte count doesn't
  // match once every response body is drained, the stream is errored
  // instead of closed. This turns a silently truncated/corrupted chunk
  // download (e.g. a flaky connection or a stale/short CDN cache entry)
  // into a hard, visible failure instead of a partially-mounted virtual
  // filesystem downstream (see: busytex compiles failing with spurious
  // "File `X.sty' not found" errors for packages that are actually
  // bundled, because the archive containing them got cut off mid-download).
  function createVerifiedStream(responses, expectedSize, describeSource) {
    return new ReadableStream({
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
            controller.error(new Error(
              `Incomplete download for ${describeSource}: received ${received} bytes, expected ${expectedSize} bytes. ` +
              `The cached or downloaded asset is truncated/corrupted.`
            ));
            return;
          }

          controller.close();
        } catch (err) {
          controller.error(err);
        }
      }
    });
  }

  globalScope.fetch = async function (...args) {
    const requestTarget = args[0];
    const urlStr = typeof requestTarget === 'string'
      ? requestTarget
      : (requestTarget && typeof requestTarget === 'object' && 'url' in requestTarget ? requestTarget.url : String(requestTarget));

    try {
      const parsedUrl = new URL(urlStr, globalScope.location ? globalScope.location.href : 'http://localhost');
      const pathname = parsedUrl.pathname;
      const manifest = await getChunkManifest();

      const entry = manifest[pathname];
      if (entry && entry.chunks && entry.chunks.length > 0) {
        if (entry.chunks.length === 1) {
          const response = await originalFetch(entry.chunks[0], args[1]);
          if (response.ok) {
            const verifiedStream = createVerifiedStream([response], entry.gzippedSize, pathname);
            const body = entry.gzipped && typeof DecompressionStream !== 'undefined'
              ? verifiedStream.pipeThrough(new DecompressionStream('gzip'))
              : verifiedStream;

            const contentType = pathname.endsWith('.wasm')
              ? 'application/wasm'
              : (pathname.endsWith('.js') ? 'application/javascript' : (response.headers.get('content-type') || 'application/octet-stream'));

            const headers = new Headers(response.headers);
            headers.delete('content-length');
            headers.delete('content-encoding');
            headers.set('Content-Type', contentType);

            return new Response(body, {
              status: response.status,
              statusText: response.statusText,
              headers: headers
            });
          }
        } else {
          const responses = await Promise.all(entry.chunks.map(chunkUrl => originalFetch(chunkUrl, args[1])));
          const allOk = responses.every(r => r.ok);
          if (allOk) {
            const combinedStream = createVerifiedStream(responses, entry.gzippedSize, pathname);

            const body = entry.gzipped && typeof DecompressionStream !== 'undefined'
              ? combinedStream.pipeThrough(new DecompressionStream('gzip'))
              : combinedStream;

            const contentType = pathname.endsWith('.wasm')
              ? 'application/wasm'
              : (pathname.endsWith('.js') ? 'application/javascript' : (responses[0].headers.get('content-type') || 'application/octet-stream'));

            return new Response(body, {
              status: 200,
              statusText: 'OK',
              headers: {
                'Content-Type': contentType
              }
            });
          } else {
            throw new Error(`Failed to fetch one or more chunks for ${pathname}`);
          }
        }
      }

      const res = await originalFetch(...args);
      if (res.ok && (pathname.endsWith('.wasm') || pathname.endsWith('.wasm.bin'))) {
        const headers = new Headers(res.headers);
        headers.set('Content-Type', 'application/wasm');
        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers: headers
        });
      }
      return res;
    } catch (err) {
      // Fall through to originalFetch on error
    }

    return originalFetch(...args);
  };
})();
