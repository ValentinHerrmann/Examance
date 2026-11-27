/** Client-side LaTeX compiler: the browser engine (compiler.worker.ts, issue #346) or a server compile job (POST /api/v1/compile/latex/jobs). */

import { writable } from 'svelte/store';
import { api } from '#lib/api/client';
import { translate } from '#lib/i18n';
import { featureEnabled } from '#lib/stores/capabilities';
import { base64ToUint8Array, uint8ArrayToBase64 } from '#lib/crypto/aesGcm';
import { mergeResources, type LatexResourceFile } from './resources';
import { loadLatexAssets } from './assets';
import type { CompileLogo } from './logo';
import { LatexCompileError, withSourceLocations } from './compileError';
import { extractSourceMap, type SourceRange } from './sourceMap';
import { latexDownloadProgress, type LatexDownloadProgress } from './downloadProgress';

/** An auxiliary file (`main.aux`, `main.toc`, `main.out`) a compile left behind; seeding the next compile with it usually saves a TeX pass (issue #341). */
export interface AuxFile {
  path: string;
  content: Uint8Array;
}

export interface CompileResult {
  pdfBytes: Uint8Array;
  usedFallback: boolean;
  engineUsed: 'server' | 'local';
  /** Graphics the engine could not load. A missing figure does not fail a XeLaTeX run — the PDF just comes back without it — so callers should show these rather than treat the compile as clean. */
  missingGraphics?: string[];
  /** Wall time of the compile as the teacher waited for it; absent on a cache hit. */
  durationMs?: number;
  /** The aux files to seed the next compile of the same document with. */
  aux?: AuxFile[];
  /** Served from the compile cache, no engine ran. */
  fromCache?: boolean;
  /** Uncompressed SyncTeX of main.tex (issue #347), kept in memory only; lines past the preamble are shifted by `synctexLineShift` (the format wrapper). */
  synctex?: Uint8Array;
  synctexLineShift?: number;
  /** Where each marked exercise body sits in the compiled document (sourceMap.ts). */
  sourceRanges?: SourceRange[];
}

/** `session` names the document (its cache slot) so the browser engine keeps its checkpoints for the next edit; without one it compiles from scratch. `synctex` asks the server for SyncTeX too (the browser engine always writes it). */
type CompileOpts = { resources?: LatexResourceFile[]; resourceExerciseIds?: string[]; logo?: CompileLogo; seedAux?: AuxFile[]; session?: string; synctex?: boolean };

/** The browser engine itself failed (boot, download, crash, timeout), not the document: the server may compile it instead. */
export class LocalEngineFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalEngineFailedError';
  }
}

/** The browser engine cannot run on this device (no memory for an engine instance). */
export class LocalEngineUnavailableError extends LocalEngineFailedError {
  constructor(message: string) {
    super(message);
    this.name = 'LocalEngineUnavailableError';
  }
}

/** Set when an engine failure was compiled on the server instead; `LocalLatexNotice` then offers to compile there from now on. */
export const engineFallbackStore = writable(false);

/** One compiler worker, created on first use and kept for the session. Compiles are serialised via `compileQueue`; the worker keeps a few engine sessions with their checkpoints, so a second worker would only double them. */
let worker: Worker | null = null;
let msgIdCounter = 0;
let compileQueue: Promise<any> = Promise.resolve();

/** How long a single compile may run before we stop waiting for the worker. */
const COMPILE_TIMEOUT_MS = 5 * 60 * 1000;

/** What the engine is doing while it boots, and how many compiles wait for it. The dialog shows for a real download and whenever a compile is waiting; a cached engine that boots in the background after a page load is not worth interrupting anyone for. */
let engineLoad: LatexDownloadProgress | null = null;
/** The TeX Live packages were already in the browser's cache: the boot still streams them, but nothing is downloaded. */
let engineCached = false;
let waitingCompiles = 0;

function publishLoad(): void {
  const visible = engineLoad && (waitingCompiles > 0 || (engineLoad.phase === 'download' && !engineCached));
  latexDownloadProgress.set(visible ? engineLoad : null);
}

function acquireWorker(): Worker {
  if (!worker) {
    const w = new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' });
    // Download progress is not tied to a compile id, so it is handled here for the worker's whole life.
    let bytesDone = false;
    w.addEventListener('message', (e: MessageEvent) => {
      const m = e.data;
      if (m?.type === 'tree-request') {
        void answerTreeRequest(w, m);
        return;
      }
      if (m?.type !== 'download') return;
      if (typeof m.cached === 'boolean') engineCached = m.cached;
      if (m.done) {
        bytesDone = false;
        engineLoad = null;
      } else if (m.phase === 'download') {
        // Bytes lead while they are still coming in; after the last one the dialog moves on to unpacking.
        bytesDone = m.loaded >= m.total;
        engineLoad = bytesDone
          ? { phase: 'prepare', step: 0, steps: 0 }
          : { phase: 'download', loaded: m.loaded, total: m.total };
      } else if (m.steps === 0 || bytesDone || engineLoad?.phase !== 'download') {
        engineLoad = { phase: 'prepare', step: m.step, steps: m.steps };
      }
      publishLoad();
    });
    worker = w;
  }
  return worker;
}

/** TeX Live files for the worker (issue #346): only the main thread's API client can refresh an expired session. */
async function answerTreeRequest(w: Worker, m: { reqId: number; kind: 'manifest' | 'file'; path?: string; version?: string }): Promise<void> {
  try {
    if (m.kind === 'manifest') {
      w.postMessage({ type: 'tree-reply', reqId: m.reqId, value: await api.get('/texlive/index.json', { silentError: true }) });
      return;
    }
    const path = (m.path ?? '').split('/').map(encodeURIComponent).join('/');
    const bytes = new Uint8Array(await api.getBinary(`/texlive/${path}?v=${encodeURIComponent(m.version ?? '')}`, { silentError: true }));
    w.postMessage({ type: 'tree-reply', reqId: m.reqId, value: bytes }, [bytes.buffer]);
  } catch (err) {
    w.postMessage({ type: 'tree-reply', reqId: m.reqId, error: err instanceof Error ? err.message : String(err) });
  }
}

/** Drops the worker so the next compile starts a fresh one. */
function discardWorker(reason = 'unspecified'): void {
  console.info(`[compiler] compiler worker discarded: ${reason}`);
  try {
    worker?.terminate();
  } catch {
    // Already gone; nothing to do.
  }
  worker = null;
  engineLoad = null;
  publishLoad();
}

/** The worker already asked to preload; keyed on the instance so a replaced worker is preloaded again. */
let preloadedWorker: Worker | null = null;

/** Boots the local engine (WASM + TeX Live packages) without compiling, so the first compile does not pay for it. Idempotent per worker; a failure is logged only, the first compile retries the boot itself. */
export function preloadLocalEngine(): void {
  try {
    const w = acquireWorker();
    if (preloadedWorker === w) return;
    preloadedWorker = w;
    // No compile is listening yet: a worker that fails to load must not stay behind as the one to compile on.
    w.addEventListener(
      'error',
      () => {
        if (worker === w) discardWorker('worker error before any compile');
      },
      { once: true }
    );
    void sendAssets(w)
      .then(() => w.postMessage({ type: 'preload' }))
      .catch((err) => console.warn('[compiler] Could not preload the local LaTeX engine:', err));
  } catch (err) {
    console.warn('[compiler] Could not preload the local LaTeX engine:', err);
  }
}

/** The worker's bundled assets come from the authenticated endpoint; posted once per worker. */
let assetsSentTo: Worker | null = null;
async function sendAssets(w: Worker): Promise<void> {
  if (assetsSentTo === w) return;
  w.postMessage({ type: 'assets', files: await loadLatexAssets() });
  assetsSentTo = w;
}

async function compileLocalWasm(
  latexSource: string,
  onStatus?: (status: string) => void,
  resources: LatexResourceFile[] = [],
  seedAux: AuxFile[] = [],
  session?: string
): Promise<CompileResult> {
  const runTask = async (): Promise<CompileResult> => {
    const w = acquireWorker();
    await sendAssets(w);
    const id = ++msgIdCounter;

    return new Promise<CompileResult>((resolve, reject) => {
      let settled = false;

      // Cleanup must run on error/timeout too, not just a terminal message — otherwise a dead worker leaves this promise pending forever and wedges the queue behind it.
      const cleanup = () => {
        clearTimeout(timer);
        w.removeEventListener('message', onMessage);
        w.removeEventListener('error', onError);
      };
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn();
      };

      const onMessage = (e: MessageEvent) => {
        if (e.data.id !== id) return;
        if (e.data.status) {
          onStatus?.(e.data.status);
          return;
        }
        if (e.data.success) {
          settle(() =>
            resolve({
              pdfBytes: e.data.pdfBytes,
              usedFallback: false,
              engineUsed: 'local',
              missingGraphics: e.data.missingGraphics ?? [],
              aux: e.data.aux ?? [],
              synctex: e.data.synctex,
              synctexLineShift: e.data.synctexLineShift ?? 0
            })
          );
        } else if (e.data.unavailable) {
          settle(() => reject(new LocalEngineUnavailableError(e.data.error || 'The browser LaTeX engine cannot run here')));
        } else if (e.data.engineFailed) {
          settle(() => reject(new LocalEngineFailedError(e.data.error || 'The browser LaTeX engine failed')));
        } else {
          settle(() => reject(new LatexCompileError(e.data.error || 'Local compilation failed', e.data.log ?? '', 'local')));
        }
      };

      const onError = (event: ErrorEvent) => {
        // The worker itself failed, so it is not reusable.
        discardWorker(`worker error during a compile: ${event.message}`);
        settle(() => reject(new LocalEngineFailedError(event.message || 'Local compilation worker crashed')));
      };

      const timer = setTimeout(() => {
        discardWorker('compile timeout');
        settle(() =>
          reject(new LocalEngineFailedError('Local compilation timed out. The document may be too large.'))
        );
      }, COMPILE_TIMEOUT_MS);

      w.addEventListener('message', onMessage);
      w.addEventListener('error', onError);
      w.postMessage({ id, latexSource, resources, seedAux, session });
    });
  };

  // A waiting compile makes an engine that is still unpacking visible in the loading dialog.
  waitingCompiles++;
  publishLoad();
  const nextQueue = compileQueue.then(runTask, runTask);
  compileQueue = nextQueue;
  const done = () => {
    waitingCompiles--;
    publishLoad();
  };
  nextQueue.then(done, done);
  return nextQueue;
}

/** Compile a LaTeX string to PDF bytes, locally with WebAssembly when `useLocal`. `opts.resources` are placed flat next to main.tex in both engines; `opts.resourceExerciseIds` name exercises whose files the server loads itself (ignored locally); `opts.logo` is the exam header logo (lib/latex/logo.ts), resolved by the server or sent as bytes locally. */
export async function compileLatex(
  latexSource: string,
  useLocal = false,
  onStatus?: (status: string) => void,
  opts: CompileOpts = {}
): Promise<CompileResult> {
  // Builders mark each exercise body (sourceMap.ts); the engines get the unmarked document.
  const map = extractSourceMap(latexSource);
  const started = performance.now();
  try {
    const result = await compileMapped(map.tex, useLocal, onStatus, opts);
    const durationMs = Math.round(performance.now() - started);
    // Timing only, never content: shows whether a slow compile is the engine, the queue or the seeds.
    console.info(`[compiler] ${result.engineUsed} compile took ${(durationMs / 1000).toFixed(1)} s (seeded: ${(opts.seedAux ?? []).length > 0})`);
    return { ...result, durationMs, sourceRanges: map.ranges };
  } catch (err) {
    if (!(err instanceof LatexCompileError)) throw err;
    const located = withSourceLocations(err, map);
    located.files = { names: (opts.resources ?? []).map((r) => r.filename), exerciseIds: opts.resourceExerciseIds ?? [] };
    throw located;
  }
}

/** Whether a failed local compile goes to the server: only when the engine failed (a LaTeX error fails there too) and the account may compile there. */
export function fallBackToServer(err: unknown): boolean {
  if (!(err instanceof LocalEngineFailedError)) return false;
  if (featureEnabled('server_latex')) return true;
  if (err instanceof LocalEngineUnavailableError) throw new Error(translate('misc.compiler.engineUnavailable'));
  return false;
}

async function compileMapped(
  latexSource: string,
  useLocal: boolean,
  onStatus: ((status: string) => void) | undefined,
  opts: CompileOpts
): Promise<CompileResult> {
  // Throws on a real filename conflict between two exercises — surfacing that beats compiling a document where one figure silently wins.
  const resources = mergeResources(opts.resources ?? []);
  const { logo } = opts;
  const seedAux = opts.seedAux ?? [];

  if (useLocal) {
    try {
      // The logo goes in after the merge: its name is reserved, so no exercise file can collide.
      const localFiles = logo?.file ? [...resources, logo.file] : resources;
      return await compileLocalWasm(latexSource, onStatus, localFiles, seedAux, opts.session);
    } catch (err) {
      if (!fallBackToServer(err)) throw err;
      console.warn('[compiler] The browser engine failed; compiling on the server instead:', err);
      const result = await compileOnServer(latexSource, resources, opts.resourceExerciseIds, logo, seedAux, opts.synctex);
      engineFallbackStore.set(true);
      return { ...result, usedFallback: true };
    }
  }
  return compileOnServer(latexSource, resources, opts.resourceExerciseIds, logo, seedAux, opts.synctex);
}

const POLL_INTERVAL_MS = 1000;
// A warm server compile takes under 2 s (issue #341), so the first seconds are polled densely; the server allows 300 polls a minute.
const FAST_POLL_MS = 250;
const FAST_POLL_WINDOW_MS = 4000;
// Beyond the server's own job limit, so the server's answer (PDF or error) always arrives first.
const POLL_DEADLINE_MS = 11 * 60_000;

/** Polls a compile job until it answers with the PDF or throws its error (422 with log, 504, 503, 404 after a restart). */
async function pollCompileJob(jobId: string): Promise<ArrayBuffer> {
  const started = Date.now();
  const deadline = started + POLL_DEADLINE_MS;
  while (Date.now() < deadline) {
    const interval = Date.now() - started < FAST_POLL_WINDOW_MS ? FAST_POLL_MS : POLL_INTERVAL_MS;
    await new Promise((resolve) => setTimeout(resolve, interval));
    const pdf = await api.pollBinary(`/compile/latex/jobs/${encodeURIComponent(jobId)}`, { silentError: true });
    if (pdf) return pdf;
  }
  throw new Error(translate('errors.code.ERR_COMPILE_TIMEOUT'));
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

type ServerCompile = { pdfBytes: Uint8Array; aux: AuxFile[]; synctexGz?: Uint8Array; synctexLineShift?: number };

/** A job asked with `return_aux` answers JSON `{pdf_b64, aux}` (with `return_synctex` also the gzipped `synctex_b64`); a bare PDF (an older backend) still works. */
export function parseServerCompile(body: Uint8Array): ServerCompile {
  if (PDF_MAGIC.every((b, i) => body[i] === b)) return { pdfBytes: body, aux: [] };
  const parsed = JSON.parse(new TextDecoder().decode(body)) as { pdf_b64: string; aux?: Record<string, string>; synctex_b64?: string; synctex_line_shift?: number };
  return {
    pdfBytes: base64ToUint8Array(parsed.pdf_b64),
    aux: Object.entries(parsed.aux ?? {}).map(([path, b64]) => ({ path, content: base64ToUint8Array(b64) })),
    synctexGz: parsed.synctex_b64 ? base64ToUint8Array(parsed.synctex_b64) : undefined,
    synctexLineShift: parsed.synctex_line_shift ?? 0
  };
}

/** Unpacks the server's gzipped SyncTeX (plain bytes pass through); a broken file only disables click-to-source. */
async function gunzip(bytes: Uint8Array): Promise<Uint8Array | undefined> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return undefined;
  }
}

async function compileOnServer(
  latexSource: string,
  resources: LatexResourceFile[] = [],
  resourceExerciseIds: string[] = [],
  logo?: CompileLogo,
  seedAux: AuxFile[] = [],
  synctex = false
): Promise<CompileResult> {
  try {
    // A background job polled with short requests: a long compile never meets the proxy's timeout (Cloudflare cuts at 100 s).
    const { job_id: jobId } = await api.post<{ job_id: string }>(
      '/compile/latex/jobs',
      {
        latex: latexSource,
        resources: resources.map((r) => ({
          filename: r.filename,
          content_b64: uint8ArrayToBase64(r.content)
        })),
        resource_exercise_ids: resourceExerciseIds,
        logo_exam_id: logo?.examId ?? null,
        account_logo: Boolean(logo && !logo.examId),
        seed_aux: Object.fromEntries(seedAux.map((f) => [f.path, uint8ArrayToBase64(f.content)])),
        return_aux: true,
        return_synctex: synctex
      },
      // A failed compile is an expected outcome: callers show the TeX diagnostics in place, not the HTTP error modal.
      { silentError: true }
    );
    const { pdfBytes, aux, synctexGz, synctexLineShift } = parseServerCompile(new Uint8Array(await pollCompileJob(jobId)));
    const synctexBytes = synctexGz ? await gunzip(synctexGz) : undefined;
    return { pdfBytes, aux, synctex: synctexBytes, synctexLineShift, usedFallback: false, engineUsed: 'server' };
  } catch (err: any) {
    // Status 0 means the browser never got a usable response: the request was blocked, the server crashed before CORS headers were written, or the API is a different version than this build. Saying so beats "unknown error".
    if (err?.status === 0 || err?.code === 'ERR_NETWORK') {
      throw new Error(
        'LaTeX compilation failed: no response from the server. It may be unreachable, ' +
          'or running a different version of the API than this app.'
      );
    }
    if (err?.code === 'ERR_COMPILE_JOB_UNKNOWN') throw new Error(translate('errors.code.ERR_COMPILE_JOB_UNKNOWN'));
    const message = `LaTeX Compilation failed: ${err.message || 'Unknown error'}`;
    const log = typeof err?.body?.log === 'string' ? err.body.log : '';
    if (log) {
      console.error('Server compilation LOG error:', log);
      throw new LatexCompileError(message, log, 'server');
    }
    throw new Error(message);
  }
}

