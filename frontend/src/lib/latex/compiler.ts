/**
 * Client-side LaTeX Compiler.
 *
 * Compiles LaTeX source to PDF bytes.
 * Falls back to server POST /api/v1/compile/latex if WASM compiler is unavailable.
 */

import { api } from '$lib/api/client';
import { translate } from '$lib/i18n';
import { uint8ArrayToBase64 } from '$lib/crypto/aesGcm';
import { mergeResources, type LatexResourceFile } from './resources';

export interface CompileResult {
  pdfBytes: Uint8Array;
  usedFallback: boolean;
  engineUsed: 'server' | 'local';
  /**
   * Graphics the engine could not load. A missing figure does not fail a
   * XeLaTeX run — the PDF just comes back without it — so callers should show
   * these rather than treat the compile as clean.
   */
  missingGraphics?: string[];
}

/**
 * One compiler worker, created on first use and kept for the session.
 *
 * Compiles are serialised through `compileQueue` below and busytex is a
 * single WASM VM, so there is no concurrency to gain — a second worker would
 * only double the multi-hundred-megabyte TeX Live mount in memory.
 */
let worker: Worker | null = null;
let msgIdCounter = 0;
let compileQueue: Promise<any> = Promise.resolve();

/** How long a single compile may run before we stop waiting for the worker. */
const COMPILE_TIMEOUT_MS = 5 * 60 * 1000;

function acquireWorker(): Worker {
  worker ??= new Worker(new URL('./compiler.worker.ts', import.meta.url), {
    type: 'module'
  });
  return worker;
}

/** Drops the worker so the next compile starts a fresh one. */
function discardWorker(): void {
  try {
    worker?.terminate();
  } catch {
    // Already gone; nothing to do.
  }
  worker = null;
}

async function compileLocalWasm(
  latexSource: string,
  onStatus?: (status: string) => void,
  resources: LatexResourceFile[] = []
): Promise<CompileResult> {
  const runTask = async (): Promise<CompileResult> => {
    const w = acquireWorker();
    const id = ++msgIdCounter;

    return new Promise<CompileResult>((resolve, reject) => {
      let settled = false;

      // Cleanup must run on error/timeout too, not just a terminal message —
      // otherwise a dead worker leaves this promise pending forever and
      // wedges the queue behind it.
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
              missingGraphics: e.data.missingGraphics ?? []
            })
          );
        } else {
          settle(() => reject(new Error(e.data.error || 'Local compilation failed')));
        }
      };

      const onError = (event: ErrorEvent) => {
        // The worker itself failed, so it is not reusable.
        discardWorker();
        settle(() => reject(new Error(event.message || 'Local compilation worker crashed')));
      };

      const timer = setTimeout(() => {
        discardWorker();
        settle(() =>
          reject(new Error('Local compilation timed out. The document may be too large.'))
        );
      }, COMPILE_TIMEOUT_MS);

      w.addEventListener('message', onMessage);
      w.addEventListener('error', onError);
      w.postMessage({ id, latexSource, resources });
    });
  };

  const nextQueue = compileQueue.then(runTask, runTask);
  compileQueue = nextQueue;
  return nextQueue;
}

/**
 * Compile LaTeX string to PDF Uint8Array.
 *
 * @param latexSource Full LaTeX document source string.
 * @param useLocal Whether to compile locally using WebAssembly.
 * @param opts.resources Files the document references by name (images, PDFs,
 *   data files). They are placed flat next to main.tex in both engines; on the
 *   server they travel inline and are discarded with the temp directory.
 * @param opts.resourceExerciseIds Saved exercises whose stored files the server
 *   should load from its own database — used instead of inlining bytes the
 *   server already has. Ignored by the local engine, which cannot read them.
 */
export async function compileLatex(
  latexSource: string,
  useLocal = false,
  onStatus?: (status: string) => void,
  promptFallback = true,
  opts: { resources?: LatexResourceFile[]; resourceExerciseIds?: string[] } = {}
): Promise<CompileResult> {
  // Throws on a real filename conflict between two exercises — surfacing that
  // beats compiling a document where one figure silently wins.
  const resources = mergeResources(opts.resources ?? []);

  if (useLocal) {
    try {
      return await compileLocalWasm(latexSource, onStatus, resources);
    } catch (err: any) {
      if (promptFallback && typeof window !== 'undefined' && window.confirm(translate('misc.compiler.localFailedTryServer'))) {
        const result = await compileOnServer(latexSource, resources, opts.resourceExerciseIds);
        return { ...result, usedFallback: true };
      }
      throw err;
    }
  }
  return compileOnServer(latexSource, resources, opts.resourceExerciseIds);
}

async function compileOnServer(
  latexSource: string,
  resources: LatexResourceFile[] = [],
  resourceExerciseIds: string[] = []
): Promise<CompileResult> {
  try {
    const pdfBuffer = await api.postJsonForBinary(
      '/compile/latex',
      {
        latex: latexSource,
        resources: resources.map((r) => ({
          filename: r.filename,
          content_b64: uint8ArrayToBase64(r.content)
        })),
        resource_exercise_ids: resourceExerciseIds
      }
    );
    return {
      pdfBytes: new Uint8Array(pdfBuffer),
      usedFallback: false,
      engineUsed: 'server',
    };
  } catch (err: any) {
    // Status 0 means the browser never got a usable response: the request was
    // blocked, the server crashed before CORS headers were written, or the API
    // is a different version than this build. Saying so beats "unknown error".
    if (err?.status === 0 || err?.code === 'ERR_NETWORK') {
      throw new Error(
        'LaTeX compilation failed: no response from the server. It may be unreachable, ' +
          'or running a different version of the API than this app.'
      );
    }
    throw new Error(`LaTeX Compilation failed: ${err.message || 'Unknown error'}`);
  }
}

