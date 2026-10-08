import './fetchInterceptor';

import { BusyTexRunner, XeLatex, isPackageCached, clearAllPackageCache } from 'texlyre-busytex';
import type { LogEntry } from 'texlyre-busytex';

let runner: BusyTexRunner | null = null;
let xelatex: XeLatex | null = null;

const packages = [
  '/core/busytex/texlive-basic.js',
  '/core/busytex/texlive-recommended.js',
  '/core/busytex/texlive-extra.js'
];

// --- Asset-version cache busting ---
// texlyre-busytex's own `ensureCacheVersion` is a no-op here (it guards on `localStorage`, absent in
// Workers) and keys on the npm version, which does not change when we redeploy our own TeX Live
// bundles, so stale packages would cause bogus "File `X.sty' not found". We track our own
// fingerprint (the chunk manifest) in IndexedDB (available in Workers) and wipe the cache when it changes.
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
    try {
      await runner.initialize();
    } catch (err) {
      // A half-built runner would make the next call fail with "failed to initialize" instead of retrying.
      resetRunner();
      throw err;
    }
    xelatex = new XeLatex(runner);
  } else {
    onStatus('compiling');
  }
}

/**
 * The bundled LaTeX assets, fetched once per worker and cached — a compile
 * should not re-fetch `/latex-assets/index.json` and its files every time.
 */
let additionalFilesPromise: Promise<{ path: string; content: Uint8Array }[]> | null = null;

function loadAdditionalFiles(): Promise<{ path: string; content: Uint8Array }[]> {
  additionalFilesPromise ??= fetchAdditionalFiles().catch((err) => {
    // Don't cache a failure: the next compile should retry rather than inherit
    // a rejected promise for the lifetime of the worker.
    additionalFilesPromise = null;
    throw err;
  });
  return additionalFilesPromise;
}

async function fetchAdditionalFiles(): Promise<{ path: string; content: Uint8Array }[]> {
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

// Matches "File `foo.sty' not found" errors for files in our bundled TeX Live packages. That
// strongly suggests corrupted/truncated cached package data (see fetchInterceptor.ts), not broken
// LaTeX, so wipe the cache and retry exactly once before surfacing the error.
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

// The xetex_bibtex8_dvipdfmx pipeline runs xdvipdfmx even after XeTeX failed, so the log then ends in
// this fatal while the real error sits in the XeTeX step's log (`result.logs`).
export const XDV_OPEN_FATAL_PATTERN = /xdvipdfmx:fatal: Could not open specified DVI \(or XDV\) file/i;

/** TeX "!" errors, each through its `l.<n>` context line and the line after it. */
export function extractTexErrors(text: string | undefined | null, maxBlocks = 5): string[] {
  if (!text) return [];
  const lines = text.split('\n');
  const blocks: string[] = [];
  for (let i = 0; i < lines.length && blocks.length < maxBlocks; i++) {
    if (!lines[i].startsWith('!')) continue;
    const limit = Math.min(lines.length, i + 12);
    let j = i + 1;
    while (j < limit && !/^l\.\d+/.test(lines[j])) j++;
    const stop = j < limit ? j + 2 : limit;
    blocks.push(
      lines
        .slice(i, stop)
        .map((line) => line.trimEnd())
        .filter(Boolean)
        .join('\n')
    );
    i = stop - 1;
  }
  return blocks;
}

type CompileStep = Partial<Pick<LogEntry, 'cmd' | 'log' | 'stdout' | 'stderr' | 'exit_code'>>;

/** The message for a failed compile: the XeTeX step's errors when the log only shows the follow-up xdvipdfmx fatal. */
export function describeCompileFailure(result: {
  log?: string | null;
  logs?: readonly CompileStep[] | null;
}): string {
  const full = result.log || 'Compilation failed';
  if (!XDV_OPEN_FATAL_PATTERN.test(full)) return full;

  const steps = (result.logs ?? []).filter((step) => !/xdvipdfmx/i.test(step.cmd ?? ''));
  const failed =
    steps.find((step) => (step.exit_code ?? 0) !== 0) ?? steps.find((step) => /xetex/i.test(step.cmd ?? ''));
  for (const text of [failed?.log, failed?.stdout, failed?.stderr]) {
    const blocks = extractTexErrors(text);
    if (blocks.length > 0) return blocks.join('\n\n');
  }
  return full;
}

async function recoverFromPossiblyCorruptedCache(): Promise<void> {
  resetRunner();
  try {
    await clearAllPackageCache();
  } catch (err) {
    console.warn('[CompilerWorker] Failed to clear package cache during recovery:', err);
  }
}

/**
 * Whether the missing-package cache wipe has already been spent in this worker.
 * See the guard in the message handler below.
 */
let cacheRecoveryAttempted = false;

let compileQueue: Promise<void> = Promise.resolve();

/** Boots the engine and loads the bundled assets without compiling; a failure only costs the head start. */
async function preloadEngine(): Promise<void> {
  try {
    await initRunner(() => {});
    await loadAdditionalFiles();
  } catch (err) {
    console.warn('[CompilerWorker] Preload failed; the first compile will retry.', err);
  }
}

self.onmessage = (e: MessageEvent) => {
  // Queued like a compile, so a compile posted meanwhile waits for the boot instead of racing it.
  if (e.data?.type === 'preload') {
    compileQueue = compileQueue.then(preloadEngine);
    return;
  }

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

      // At most one cache-wipe recovery per worker: the pattern can't tell a
      // corrupted cache from a document referencing a package we don't ship,
      // so without this guard that case re-downloads TeX Live on every retry.
      if (
        !result.success &&
        !cacheRecoveryAttempted &&
        looksLikeMissingBundledPackage(describeCompileFailure(result))
      ) {
        cacheRecoveryAttempted = true;
        console.warn(
          "[CompilerWorker] Compile failed with a missing-file error for what should be a bundled package; " +
            "clearing package cache and retrying once in case the local copy is stale/corrupted."
        );
        await recoverFromPossiblyCorruptedCache();
        result = await runCompile();
      }

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
        // Not reset here — an ordinary compile error (e.g. a LaTeX typo)
        // shouldn't force a full engine reboot on the next attempt.
        self.postMessage({ id, success: false, error: describeCompileFailure(result) });
      }
    } catch (error: any) {
      // A thrown error is different: the engine itself is in an unknown state, so reset. Required for
      // texlyre-busytex's 180 s timeout, which rejects without stopping its worker: that worker's late
      // answer would otherwise resolve the next compile.
      resetRunner();
      self.postMessage({ id, success: false, error: error.message || "Unknown error in compilation worker" });
    }
  });
};
