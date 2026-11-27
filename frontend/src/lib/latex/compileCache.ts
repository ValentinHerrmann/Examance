/** LaTeX compilation cache: avoids re-compiling identical documents across tab switches, preview reopen and (sealed in IndexedDB, `compileStore.ts`) reloads. Keyed by (kind, id, variant) and verified by a SHA-256 of source, app version, engine, resources and exam logo, so any content change misses. Each slot also keeps its last aux files, which seed the next compile of an edited document (issue #341). Entries hold raw PDF bytes; callers create short-lived object URLs and revoke them on destroy. */

import { compareCodeUnits } from '#lib/utils/compare';
import { frontendVersion } from '#lib/stores/versionStore';
import { compileLatex, type AuxFile, type CompileResult } from './compiler';
import { dropStoredCompiles, loadStoredCompile, saveStoredCompile, type StoredCompile } from './compileStore';
import { mergeResources, type LatexResourceFile } from './resources';
import { clearLogoCache, type CompileLogo } from './logo';
import { clearPackageSettingsCache } from './packageSettings';
import { sha256Hex } from '#lib/crypto/hex';
import { extractSourceMap } from './sourceMap';

/** `extra-sheet` is the exam-independent extra sheet (issue #228), keyed by its paper style. */
export type CompileKind = 'exam' | 'exercise' | 'extra-sheet' | 'layout-sample';
/** `draft` is the Exam step's task sheet without the extra pages that fill whole sheets (issue #228). */
export type CompileVariant = 'angabe' | 'loesung' | 'draft';

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
  aux: AuxFile[];
  durationMs?: number;
  /** Memory only, never in the sealed store: a reload loses click-to-source until the next compile (issue #347). */
  synctex?: Uint8Array;
  synctexLineShift?: number;
  synctexColumns?: boolean;
  provenance?: Uint8Array;
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
  engine: string = 'local',
  logoFingerprint = ''
): Promise<string> {
  const enc = new TextEncoder();
  const sortedResources = [...resources].sort((a, b) => compareCodeUnits(a.filename, b.filename));
  const sortedExIds = [...resourceExerciseIds].sort(compareCodeUnits);

  const parts: Uint8Array[] = [];
  const metaHeader = `v:${frontendVersion || '0.0.0'}|engine:${engine}|latex:${latexSource}|exIds:${JSON.stringify(sortedExIds)}|logo:${logoFingerprint}|resCount:${sortedResources.length}`;
  parts.push(enc.encode(metaHeader));

  for (const res of sortedResources) {
    parts.push(enc.encode(`\nres:${res.filename}:${res.content.length}:`), res.content);
  }

  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const p of parts) {
    combined.set(p, offset);
    offset += p.length;
  }

  return sha256Hex(combined);
}

/** Retrieves a cached entry if its slot key and content hash match. Touches the entry for LRU ordering on hit. */
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

/** Retrieves the latest cached entry for this slot without checking content hash. Used for instant preview restoration on component mount / tab switch before re-compiling. */
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

  const sizeBytes = result.pdfBytes.byteLength + (result.synctex?.byteLength ?? 0) + (result.provenance?.byteLength ?? 0);

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
    aux: result.aux ?? [],
    durationMs: result.durationMs,
    synctex: result.synctex,
    synctexLineShift: result.synctexLineShift,
    synctexColumns: result.synctexColumns,
    provenance: result.provenance,
  };

  cache.set(slotKey, entry);
  currentTotalBytes += sizeBytes;
}

/**
 * Drops a specific slot from the cache.
 */
export function invalidateSlot(key: CompileCacheKey): void {
  const slotKey = makeSlotKey(key);
  markInvalidated(slotKey);
  void dropStoredCompiles(slotKey);
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
  markInvalidated(prefix);
  void dropStoredCompiles(prefix);
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
  markInvalidated('');
  void dropStoredCompiles('');
  lastInputs.clear();
  clearLogoCache();
  clearPackageSettingsCache();
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

type CompileOpts = { resources?: LatexResourceFile[]; resourceExerciseIds?: string[]; logo?: CompileLogo; synctex?: boolean };

/** Invalidated slot-key prefixes by sequence number: a compile that was running when its slot was invalidated (an exam deleted meanwhile) must not write its PDF back. */
let invalidationSeq = 0;
const invalidatedAt = new Map<string, number>();
const MAX_INVALIDATIONS = 200;

function markInvalidated(prefix: string): void {
  invalidatedAt.delete(prefix);
  invalidatedAt.set(prefix, ++invalidationSeq);
  if (invalidatedAt.size > MAX_INVALIDATIONS) invalidatedAt.delete(invalidatedAt.keys().next().value as string);
}

function invalidatedSince(slotKey: string, seq: number): boolean {
  for (const [prefix, at] of invalidatedAt) if (at > seq && slotKey.startsWith(prefix)) return true;
  return false;
}

/** The stored compile of a slot, put into the memory level so later lookups stay synchronous. */
async function fromStore(key: CompileCacheKey): Promise<CachedCompileEntry | undefined> {
  const stored = await loadStoredCompile(makeSlotKey(key));
  if (!stored) return undefined;
  setCached(key, stored.hash, { ...stored, fromCache: true });
  return cache.get(makeSlotKey(key));
}

/** The slot's entry from memory or, after a reload, from the store; any hash. */
async function latestEntry(key: CompileCacheKey): Promise<CachedCompileEntry | undefined> {
  return getLatestForSlot(key) ?? (await fromStore(key));
}

/** Whether this slot was ever compiled in this browser (memory or store). */
export async function hasCompiledSlot(key: CompileCacheKey): Promise<boolean> {
  return !!(await latestEntry(key));
}

/** The draft and the printed task sheet differ only in the filling pages, and the solution shares the sheet's tasks and scores, so a sibling's aux is a good seed. */
const SIBLING_VARIANT: Partial<Record<CompileVariant, CompileVariant>> = { draft: 'angabe', angabe: 'draft', loesung: 'angabe' };

/** The aux files to start a compile from: the slot's last compile, else its sibling's; stale ones only cost a rerun. */
async function seedFor(key: CompileCacheKey): Promise<AuxFile[]> {
  const own = await latestEntry(key);
  if (own?.aux.length) return own.aux;
  const sibling = SIBLING_VARIANT[key.variant];
  return sibling ? ((await latestEntry({ ...key, variant: sibling }))?.aux ?? []) : [];
}

function persist(key: CompileCacheKey, hash: string, result: CompileResult): void {
  const stored: StoredCompile = {
    hash,
    pdfBytes: result.pdfBytes,
    missingGraphics: result.missingGraphics ?? [],
    engineUsed: result.engineUsed,
    usedFallback: result.usedFallback,
    durationMs: result.durationMs,
    aux: result.aux ?? [],
  };
  void saveStoredCompile(makeSlotKey(key), stored);
}

function hitResult(hit: CachedCompileEntry, latexSource: string): CompileResult {
  return {
    pdfBytes: hit.pdfBytes, usedFallback: hit.usedFallback, engineUsed: hit.engineUsed, missingGraphics: hit.missingGraphics, aux: hit.aux, fromCache: true,
    synctex: hit.synctex, synctexLineShift: hit.synctexLineShift, synctexColumns: hit.synctexColumns, provenance: hit.provenance, sourceRanges: extractSourceMap(latexSource).ranges,
  };
}

/** What each slot was last compiled from, to say which input changed when a lookup misses (issue #212: a PDF compiled on one exam tab counted as stale on another). Same lifetime as the cache. */
type InputSummary = { latex: string; resources: string; exIds: string; engine: string; logo: string };
const lastInputs = new Map<string, InputSummary>();

function summarize(latexSource: string, useLocal: boolean, opts: CompileOpts): InputSummary {
  return {
    latex: latexSource,
    resources: mergeResources(opts.resources ?? []).map((r) => `${r.filename}:${r.content.length}`).sort(compareCodeUnits).join(','),
    exIds: [...(opts.resourceExerciseIds ?? [])].sort(compareCodeUnits).join(','),
    engine: useLocal ? 'local' : 'server',
    logo: opts.logo?.fingerprint ?? '',
  };
}

/** Logs (info level) which input differs from the slot's last compile, with the first differing spot of the LaTeX. */
function explainMiss(key: CompileCacheKey, now: InputSummary): void {
  const before = lastInputs.get(makeSlotKey(key));
  if (!before) return;
  const changed = (Object.keys(now) as (keyof InputSummary)[]).filter((k) => now[k] !== before[k]);
  if (changed.length === 0) return;
  let detail = '';
  if (changed.includes('latex')) {
    let i = 0;
    while (i < now.latex.length && now.latex[i] === before.latex[i]) i++;
    detail = ` at ${i}: was ${JSON.stringify(before.latex.slice(Math.max(0, i - 40), i + 40))}, now ${JSON.stringify(now.latex.slice(Math.max(0, i - 40), i + 40))}`;
  }
  console.info(`[compileCache] ${makeSlotKey(key)} is stale: ${changed.join(', ')} changed${detail}`);
}

/** The browser engine in the hash: PDFs from the busytex engine it replaced (issue #346) are never served as its output. */
const LOCAL_ENGINE_TAG = 'local-texlive-2026';

/** Slots whose document is edited and compiled again keep an engine session with checkpoints; one-off documents (extra sheet, layout sample) do not. */
function sessionOf(key: CompileCacheKey): string | undefined {
  return key.kind === 'exercise' || key.kind === 'exam' ? makeSlotKey(key) : undefined;
}

/** The one hash recipe for a compile, shared by `compileWithCache` and `getCachedFor`. */
function hashFor(latexSource: string, useLocal: boolean, opts: CompileOpts): Promise<string> {
  return computeCompileContentHash(
    latexSource,
    mergeResources(opts.resources ?? []),
    opts.resourceExerciseIds ?? [],
    useLocal ? LOCAL_ENGINE_TAG : 'server',
    opts.logo?.fingerprint
  );
}

/** The cached entry for exactly these sources, or undefined when the slot is empty or outdated. */
export async function getCachedFor(
  key: CompileCacheKey,
  latexSource: string,
  useLocal: boolean,
  opts: CompileOpts = {}
): Promise<CachedCompileEntry | undefined> {
  if (!cache.has(makeSlotKey(key)) && !(await fromStore(key))) return undefined;
  const hit = getCached(key, await hashFor(latexSource, useLocal, opts));
  if (!hit) explainMiss(key, summarize(latexSource, useLocal, opts));
  return hit;
}

/** Compiles LaTeX with cache support: returns a hit for the key and content hash, else runs `compileLatex` and caches it. */
export async function compileWithCache(
  key: CompileCacheKey,
  latexSource: string,
  useLocal = false,
  onStatus?: (status: string) => void,
  opts: CompileOpts = {}
): Promise<CompileResult> {
  const hash = await hashFor(latexSource, useLocal, opts);
  // The store is read only when memory knows nothing of the slot (after a reload): a memory miss with another hash is current there too.
  const hit = getCached(key, hash) ?? (!cache.has(makeSlotKey(key)) && (await fromStore(key))?.hash === hash ? getCached(key, hash) : undefined);
  if (hit) return hitResult(hit, latexSource);

  const startedAt = invalidationSeq;
  const result = await compileLatex(latexSource, useLocal, onStatus, { ...opts, seedAux: await seedFor(key), session: sessionOf(key) });
  if (invalidatedSince(makeSlotKey(key), startedAt)) return result;
  setCached(key, hash, result);
  persist(key, hash, result);
  lastInputs.set(makeSlotKey(key), summarize(latexSource, useLocal, opts));
  return result;
}
