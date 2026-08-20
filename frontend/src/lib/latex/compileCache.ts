/**
 * In-memory LaTeX compilation cache.
 *
 * Prevents re-compiling identical documents when switching between exam tabs
 * (Setup, Scan, Verify, Grade, Stats), navigating between exercises, or closing
 * and reopening preview panels in a single browser session.
 *
 * Cache entries are keyed by a structured (kind, id, variant) tuple AND verified
 * by a SHA-256 hash of the exact LaTeX source, bundled app version, compile engine,
 * and attached resource files. This guarantees that:
 * 1. Exercises, exams, and blank OMR layouts cannot collide.
 * 2. Angabe (problem sheet) and Lösung (answer key) cannot collide.
 * 3. Any change in LaTeX content or resource files invalidates the cache hit.
 *
 * Entries hold raw Uint8Array PDF bytes in memory. Callers create short-lived
 * Blob/object URLs for rendering and revoke them upon component destruction.
 */

import { frontendVersion } from '$lib/stores/versionStore';
import { compileLatex, type CompileResult } from './compiler';
import { mergeResources, type LatexResourceFile } from './resources';

export type CompileKind = 'exam' | 'exercise' | 'omr-blank';
export type CompileVariant = 'angabe' | 'loesung' | 'blank';

export interface CompileCacheKey {
  kind: CompileKind;
  id: string;
  variant: CompileVariant;
}

export interface CachedCompileEntry {
  hash: string;
  pdfBytes: Uint8Array;
  missingGraphics: string[];
  engineUsed: 'local' | 'server';
  usedFallback: boolean;
  sizeBytes: number;
  lastAccess: number;
}

/** Maximum total PDF bytes kept in cache (150 MB). */
export const MAX_CACHE_TOTAL_BYTES = 150 * 1024 * 1024;
/** Maximum number of compiled documents kept in cache. */
export const MAX_CACHE_ENTRIES = 40;

const cache = new Map<string, CachedCompileEntry>();
let currentTotalBytes = 0;

/**
 * Builds an isolated slot key string from structured parts.
 */
export function makeSlotKey(key: CompileCacheKey): string {
  return `${key.kind}:${key.id}:${key.variant}`;
}

/**
 * Computes a SHA-256 digest of all inputs affecting compilation output.
 */
export async function computeCompileContentHash(
  latexSource: string,
  resources: LatexResourceFile[] = [],
  resourceExerciseIds: string[] = [],
  engine: 'local' | 'server' = 'local'
): Promise<string> {
  const enc = new TextEncoder();
  const sortedResources = [...resources].sort((a, b) => a.filename.localeCompare(b.filename));
  const sortedExIds = [...resourceExerciseIds].sort();

  const parts: Uint8Array[] = [];
  const metaHeader = `v:${frontendVersion || '0.0.0'}|engine:${engine}|latex:${latexSource}|exIds:${JSON.stringify(sortedExIds)}|resCount:${sortedResources.length}`;
  parts.push(enc.encode(metaHeader));

  for (const res of sortedResources) {
    parts.push(enc.encode(`\nres:${res.filename}:${res.content.length}:`));
    parts.push(res.content);
  }

  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const p of parts) {
    combined.set(p, offset);
    offset += p.length;
  }

  const digest = await crypto.subtle.digest('SHA-256', combined);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Retrieves a cached entry if its slot key and content hash match.
 * Touches the entry for LRU ordering on hit.
 */
export function getCached(key: CompileCacheKey, hash: string): CachedCompileEntry | undefined {
  const slotKey = makeSlotKey(key);
  const entry = cache.get(slotKey);
  if (!entry) return undefined;

  if (entry.hash !== hash) {
    return undefined;
  }

  // Refresh LRU order (delete & re-insert at end)
  entry.lastAccess = Date.now();
  cache.delete(slotKey);
  cache.set(slotKey, entry);
  return entry;
}

/**
 * Retrieves the latest cached entry for this slot without checking content hash.
 * Used for instant preview restoration on component mount / tab switch before re-compiling.
 */
export function getLatestForSlot(key: CompileCacheKey): CachedCompileEntry | undefined {
  const slotKey = makeSlotKey(key);
  const entry = cache.get(slotKey);
  if (!entry) return undefined;

  // Refresh LRU order
  entry.lastAccess = Date.now();
  cache.delete(slotKey);
  cache.set(slotKey, entry);
  return entry;
}

/**
 * Stores a compilation result in the cache, evicting LRU entries if the budget is exceeded.
 */
export function setCached(key: CompileCacheKey, hash: string, result: CompileResult): void {
  const slotKey = makeSlotKey(key);
  const existing = cache.get(slotKey);
  if (existing) {
    currentTotalBytes -= existing.sizeBytes;
    cache.delete(slotKey);
  }

  const sizeBytes = result.pdfBytes.byteLength;

  // Evict LRU entries while over budget
  while (
    cache.size >= MAX_CACHE_ENTRIES ||
    (currentTotalBytes + sizeBytes > MAX_CACHE_TOTAL_BYTES && cache.size > 0)
  ) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    const oldestEntry = cache.get(oldestKey);
    if (oldestEntry) {
      currentTotalBytes -= oldestEntry.sizeBytes;
    }
    cache.delete(oldestKey);
  }

  const entry: CachedCompileEntry = {
    hash,
    pdfBytes: result.pdfBytes,
    missingGraphics: result.missingGraphics ?? [],
    engineUsed: result.engineUsed,
    usedFallback: result.usedFallback,
    sizeBytes,
    lastAccess: Date.now(),
  };

  cache.set(slotKey, entry);
  currentTotalBytes += sizeBytes;
}

/**
 * Drops a specific slot from the cache.
 */
export function invalidateSlot(key: CompileCacheKey): void {
  const slotKey = makeSlotKey(key);
  const entry = cache.get(slotKey);
  if (entry) {
    currentTotalBytes -= entry.sizeBytes;
    cache.delete(slotKey);
  }
}

/**
 * Drops all variants belonging to a specific owner (e.g. on exam or exercise deletion).
 */
export function invalidateOwner(kind: CompileKind, id: string): void {
  const prefix = `${kind}:${id}:`;
  for (const [slotKey, entry] of cache.entries()) {
    if (slotKey.startsWith(prefix)) {
      currentTotalBytes -= entry.sizeBytes;
      cache.delete(slotKey);
    }
  }
}

/**
 * Clears all cached compilations and resets byte counters (e.g. on session lock / logout).
 */
export function clearCompileCache(): void {
  cache.clear();
  currentTotalBytes = 0;
}

/**
 * Diagnostic helper returning entry count and total cached bytes.
 */
export function getCompileCacheStats(): { entryCount: number; totalBytes: number } {
  return {
    entryCount: cache.size,
    totalBytes: currentTotalBytes,
  };
}

/**
 * Compiles LaTeX source with cache support.
 *
 * Checks if a valid compilation result matching the structured key and content hash
 * exists in memory. If found, returns the cached result immediately. Otherwise, runs
 * `compileLatex`, caches the result, and returns it.
 */
export async function compileWithCache(
  key: CompileCacheKey,
  latexSource: string,
  useLocal = false,
  onStatus?: (status: string) => void,
  promptFallback = true,
  opts: { resources?: LatexResourceFile[]; resourceExerciseIds?: string[] } = {}
): Promise<CompileResult> {
  const engine: 'local' | 'server' = useLocal ? 'local' : 'server';
  const resources = mergeResources(opts.resources ?? []);
  const hash = await computeCompileContentHash(
    latexSource,
    resources,
    opts.resourceExerciseIds ?? [],
    engine
  );

  const hit = getCached(key, hash);
  if (hit) {
    return {
      pdfBytes: hit.pdfBytes,
      usedFallback: hit.usedFallback,
      engineUsed: hit.engineUsed,
      missingGraphics: hit.missingGraphics,
    };
  }

  const result = await compileLatex(latexSource, useLocal, onStatus, promptFallback, opts);
  setCached(key, hash, result);
  return result;
}
