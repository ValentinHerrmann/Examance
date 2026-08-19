import './fetchInterceptor';

import { BusyTexRunner, XeLatex, isPackageCached, clearAllPackageCache } from 'texlyre-busytex';

let runner: BusyTexRunner | null = null;
let xelatex: XeLatex | null = null;

const packages = [
  '/core/busytex/texlive-basic.js',
  '/core/busytex/texlive-recommended.js',
  '/core/busytex/texlive-extra.js'
];

// --- Asset-version cache busting ---------------------------------------
//
// texlyre-busytex ships its own cache-busting (`ensureCacheVersion`), but
// it's keyed off the npm library's own version string and it is a no-op
// here anyway: `ensureCacheVersion` guards on `typeof localStorage`, and
// `localStorage` does not exist inside a dedicated Worker (this file runs
// as one), so that check silently never fires for this app.
//
// Redeploying our *own* static TeX Live bundles under `static/core/busytex`
// (e.g. to fix a missing/broken package) does not bump the texlyre-busytex
// npm version, so a browser that already has a package cached from before
// the fix would otherwise keep reusing the stale/broken data forever,
// producing confusing "File `X.sty' not found" errors for packages that
// are, in fact, bundled in the current deployment.
//
// We track our own fingerprint (the chunk manifest, which changes whenever
// the bundled assets are rebuilt/re-chunked) in IndexedDB - which, unlike
// localStorage, is available inside Workers - and force a full package
// cache wipe whenever it changes.
const ASSET_VERSION_DB = 'blindgrade-busytex-asset-version';
const ASSET_VERSION_STORE = 'version';
const ASSET_VERSION_KEY = 'fingerprint';

function openAssetVersionDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const request = indexedDB.open(ASSET_VERSION_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(ASSET_VERSION_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function getStoredAssetFingerprint(): Promise<string | null> {
  const db = await openAssetVersionDb();
  if (!db) return null;
  try {
    return await new Promise((resolve) => {
      const tx = db.transaction(ASSET_VERSION_STORE, 'readonly');
      const req = tx.objectStore(ASSET_VERSION_STORE).get(ASSET_VERSION_KEY);
      req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } finally {
    db.close();
  }
}

async function setStoredAssetFingerprint(fingerprint: string): Promise<void> {
  const db = await openAssetVersionDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(ASSET_VERSION_STORE, 'readwrite');
      tx.objectStore(ASSET_VERSION_STORE).put(fingerprint, ASSET_VERSION_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } finally {
    db.close();
  }
}

async function fetchAssetFingerprint(): Promise<string | null> {
  try {
    const res = await fetch('/core/busytex/chunk-manifest.json');
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function ensureAssetCacheIsFresh(): Promise<void> {
  const [stored, current] = await Promise.all([getStoredAssetFingerprint(), fetchAssetFingerprint()]);
  if (!current) return; // Can't determine freshness; don't wipe a possibly-good cache.
  if (stored !== null && stored !== current) {
    console.warn('[CompilerWorker] Bundled TeX Live assets changed since last visit; clearing cached packages.');
    try {
      await clearAllPackageCache();
    } catch (err) {
      console.warn('[CompilerWorker] Failed to clear stale package cache:', err);
    }
  }
  if (stored !== current) {
    await setStoredAssetFingerprint(current);
  }
}

// --- Runner lifecycle ----------------------------------------------------

async function initRunner(onStatus: (status: string) => void) {
  if (!runner) {
    await ensureAssetCacheIsFresh();

    let allCached = true;
    for (const pkg of packages) {
      try {
        if (!(await isPackageCached(pkg))) {
          allCached = false;
          break;
        }
      } catch {
        allCached = false;
        break;
      }
    }

    if (!allCached) {
      onStatus('downloading');
    } else {
      onStatus('compiling');
    }

    runner = new BusyTexRunner({
      busytexBasePath: '/core/busytex',
      preloadDataPackages: packages
    });
    await runner.initialize();
    xelatex = new XeLatex(runner);
  } else {
    onStatus('compiling');
  }
}

async function loadAdditionalFiles(): Promise<{ path: string; content: Uint8Array }[]> {
  const indexRes = await fetch('/latex-assets/index.json');
  if (!indexRes.ok) {
    console.warn("Failed to load latex-assets index.json. Assets may be missing.");
  }
  const assetPaths: string[] = indexRes.ok ? await indexRes.json() : [];

  const filesArrays = await Promise.all(
    assetPaths
      .filter((path) => !path.startsWith('main.'))
      .map(async (path) => {
        const res = await fetch(`/latex-assets/${path}`);
      const buffer = await res.arrayBuffer();
      const content = new Uint8Array(buffer);
      const files = [{ path, content }];
      
      if (path.startsWith('sty/') && path.endsWith('.sty')) {
        files.push({ path: path.replace('sty/', ''), content });
      }
      
      return files;
    })
  );
  return filesArrays.flat();
}

function resetRunner() {
  if (runner) {
    try {
      runner.terminate();
    } catch {}
    runner = null;
    xelatex = null;
  }
}

// Matches LaTeX's "File `foo.sty' not found" style errors for the kinds of
// files that ship inside our bundled TeX Live packages. If a compile fails
// this way, it's a strong signal that the locally cached package data is
// missing, truncated, or otherwise corrupted (see fetchInterceptor.ts) -
// not that the document's LaTeX is actually broken - so it's worth wiping
// the cache and trying exactly once more with a guaranteed-clean download
// before surfacing the error to the user.
export const MISSING_PACKAGE_FILE_PATTERN = /File `[^']+\.(sty|cls|clo|def|cfg|fd)' not found/i;

export function looksLikeMissingBundledPackage(log: string | undefined | null): boolean {
  return !!log && MISSING_PACKAGE_FILE_PATTERN.test(log);
}

// A missing figure is not fatal to XeLaTeX: it typesets a box and carries on,
// so the compile "succeeds" with the picture silently absent. Surfacing it is
// the difference between a teacher noticing now and noticing on exam day.
export const MISSING_GRAPHICS_PATTERN =
  /(File `[^']+\.(png|jpe?g|pdf|eps)' not found|Unable to load picture|Cannot determine size of graphic)/i;

export function extractMissingGraphics(log: string | undefined | null): string[] {
  if (!log) return [];
  return log
    .split("\n")
    .filter((line) => MISSING_GRAPHICS_PATTERN.test(line))
    .map((line) => line.trim());
}

async function recoverFromPossiblyCorruptedCache(): Promise<void> {
  resetRunner();
  try {
    await clearAllPackageCache();
  } catch (err) {
    console.warn('[CompilerWorker] Failed to clear package cache during recovery:', err);
  }
}

let compileQueue: Promise<void> = Promise.resolve();

self.onmessage = (e: MessageEvent) => {
  const { id, latexSource, resources } = e.data as {
    id: number;
    latexSource: string;
    resources?: { filename: string; content: Uint8Array }[];
  };

  compileQueue = compileQueue.then(async () => {
    const runCompile = async () => {
      await initRunner((status) => {
        self.postMessage({ id, status });
      });

      if (!xelatex) {
        throw new Error("XeLatex engine failed to initialize");
      }

      const additionalFiles = await loadAdditionalFiles();

      // Teacher-uploaded resources go in flat, after the bundled assets, and
      // never over one: a name that would shadow an asset is already refused
      // at upload time (lib/latex/resources.ts), this is the second line.
      const bundledPaths = new Set(additionalFiles.map((f) => f.path));
      for (const res of resources ?? []) {
        if (bundledPaths.has(res.filename)) {
          console.warn(`[CompilerWorker] Skipping resource '${res.filename}': bundled asset owns that name.`);
          continue;
        }
        additionalFiles.push({ path: res.filename, content: res.content });
      }

      return xelatex.compile({
        input: latexSource,
        additionalFiles
      });
    };

    try {
      let result = await runCompile();

      if (!result.success && looksLikeMissingBundledPackage(result.log)) {
        console.warn(
          "[CompilerWorker] Compile failed with a missing-file error for what should be a bundled package; " +
            "clearing package cache and retrying once in case the local copy is stale/corrupted."
        );
        await recoverFromPossiblyCorruptedCache();
        result = await runCompile();
      }

      console.log("Compilation finished. PDF Bytes:", result.pdf?.length);
      if (!result.success) {
        console.error("Compilation LOG error:", result.log);
      } else if (result.log) {
        const warnings = result.log
          .split("\n")
          .filter(
            (line: string) =>
              line.includes("Undefined control sequence") ||
              line.includes("LaTeX Warning") ||
              line.includes("Missing ") ||
              line.includes("omr") ||
              MISSING_GRAPHICS_PATTERN.test(line)
          );
        if (warnings.length > 0) {
          console.warn("[CompilerWorker] Successful compile produced LaTeX warnings/notices:", warnings);
        }
      }

      if (result.success && result.pdf) {
        self.postMessage({
          id,
          success: true,
          pdfBytes: result.pdf,
          missingGraphics: extractMissingGraphics(result.log)
        });
      } else {
        resetRunner();
        self.postMessage({ id, success: false, error: result.log || "Compilation failed" });
      }
    } catch (error: any) {
      resetRunner();
      self.postMessage({ id, success: false, error: error.message || "Unknown error in compilation worker" });
    }
  });
};
