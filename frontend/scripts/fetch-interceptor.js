// @ts-nocheck
(function () {
  let globalScope = globalThis;
  if (typeof window !== 'undefined') globalScope = window;
  else if (typeof self !== 'undefined') globalScope = self;
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

  // Byte progress for the app's loading dialog. busytex forwards a worker's `print` messages that look like "Downloading data... (loaded/total)" to its onDownloadProgress; its own emscripten status text never carries bytes. Totals are compressed network bytes over the whole manifest (engine wasm plus the TeX Live packages).
  const inWorker = typeof WorkerGlobalScope !== 'undefined' && globalScope instanceof WorkerGlobalScope;
  let loadedBytes = 0;
  let lastReport = 0;
  function reportProgress(force) {
    if (!inWorker) return;
    const now = Date.now();
    if (!force && now - lastReport < 100) return;
    lastReport = now;
    getChunkManifest().then((manifest) => {
      const total = Object.values(manifest).reduce((sum, e) => sum + (e?.gzippedSize ? e.gzippedSize : 0), 0);
      if (total > 0) globalScope.postMessage({ print: `Downloading data... (${Math.min(loadedBytes, total)}/${total})` });
    });
  }

  // Concatenates the bodies of `responses` while counting raw (pre-decompression) bytes. If the manifest's expected size does not match, the stream errors instead of closing, so a truncated download fails loudly rather than mounting a partial virtual filesystem (busytex "File `X.sty' not found" for bundled packages).
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
              loadedBytes += value.byteLength;
              reportProgress(false);
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

          reportProgress(true);
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      }
    });
  }

  function requestUrl(target) {
    if (typeof target === 'string') return target;
    if (target && typeof target === 'object' && 'url' in target) return target.url;
    return String(target);
  }

  function pickContentType(pathname, fallback) {
    if (pathname.endsWith('.wasm')) return 'application/wasm';
    if (pathname.endsWith('.js')) return 'application/javascript';
    return fallback || 'application/octet-stream';
  }

  function gunzipIfNeeded(stream, entry) {
    return entry.gzipped && typeof DecompressionStream !== 'undefined'
      ? stream.pipeThrough(new DecompressionStream('gzip'))
      : stream;
  }

  // Null means "not served from the single chunk": the caller falls back to the plain fetch.
  async function fetchSingleChunk(entry, pathname, init) {
    const response = await originalFetch(entry.chunks[0], init);
    if (!response.ok) return null;
    const body = gunzipIfNeeded(createVerifiedStream([response], entry.gzippedSize, pathname), entry);
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.set('Content-Type', pickContentType(pathname, response.headers.get('content-type')));
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: headers
    });
  }

  async function fetchMultiChunk(entry, pathname, init) {
    const responses = await Promise.all(entry.chunks.map(chunkUrl => originalFetch(chunkUrl, init)));
    if (!responses.every(r => r.ok)) {
      throw new Error(`Failed to fetch one or more chunks for ${pathname}`);
    }
    const body = gunzipIfNeeded(createVerifiedStream(responses, entry.gzippedSize, pathname), entry);
    return new Response(body, {
      status: 200,
      statusText: 'OK',
      headers: {
        'Content-Type': pickContentType(pathname, responses[0].headers.get('content-type'))
      }
    });
  }

  globalScope.fetch = async function (...args) {
    const urlStr = requestUrl(args[0]);

    try {
      const parsedUrl = new URL(urlStr, globalScope.location ? globalScope.location.href : 'http://localhost');
      const pathname = parsedUrl.pathname;
      const manifest = await getChunkManifest();

      const entry = manifest[pathname];
      if (entry?.chunks?.length > 0) {
        const chunked = entry.chunks.length === 1
          ? await fetchSingleChunk(entry, pathname, args[1])
          : await fetchMultiChunk(entry, pathname, args[1]);
        if (chunked) return chunked;
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
