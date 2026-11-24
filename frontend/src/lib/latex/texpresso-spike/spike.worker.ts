/// <reference lib="webworker" />
/** TeXpresso spike worker: owns the engine, its checkpoints and the aux loop; XDV to PDF runs in xdv.worker.ts. */
import '../fetchInterceptor';
import { TexpressoEngine, type RunResult } from './engine';
import { loadTexTree, type TexTree } from './texTree';

export const ENGINE_BASE = '/core/texpresso-spike';
const BUSYTEX_FORMAT = '/texlive/texmf-dist/texmf-var/web2c/xetex/xelatex.fmt';
const OWN_FORMAT = '/fmt/xelatex.fmt';
const AUX_FILES = ['main.aux', 'main.toc', 'main.out'];
const MAX_PASSES = 4;

export type SpikeRequest =
  | { type: 'init'; id: number; assets: { path: string; content: Uint8Array }[] }
  | { type: 'compile'; id: number; tex: string; full?: boolean }
  | { type: 'bench'; id: number; base: string; edits: { label: string; tex: string }[] };

export interface BenchRow {
  label: string;
  /** Incremental update after the edit: engine passes, then xdvipdfmx. */
  passes: PassInfo[];
  engineMs: number;
  xdvMs: number;
  /** The same document typeset from scratch in a fresh engine. */
  fullEngineMs: number;
  fullPasses: number;
  identicalXdv: boolean;
  checkpoints: number;
  checkpointBytes: number;
}

export interface PassInfo {
  ms: number;
  resumedFrom: 'start' | number;
}

export interface CompileReply {
  id: number;
  pdf: Uint8Array | null;
  synctex: string;
  log: string;
  xdvBytes: number;
  passes: PassInfo[];
  engineMs: number;
  xdvMs: number;
  totalMs: number;
  checkpoints: number;
  checkpointBytes: number;
  memoryBytes: number;
  error?: string;
}

let tree: TexTree | null = null;
let engine: TexpressoEngine | null = null;
let module: WebAssembly.Module | null = null;
let icu: Uint8Array | null = null;
let format = BUSYTEX_FORMAT;
let hasRun = false;
const xdvWorker = new Worker(new URL('./xdv.worker.ts', import.meta.url), { type: 'classic' });
let xdvSeq = 0;
const xdvWaiters = new Map<number, (r: any) => void>();
xdvWorker.onmessage = (e) => {
  xdvWaiters.get(e.data.id)?.(e.data);
  xdvWaiters.delete(e.data.id);
};

function xdv(bytes?: Uint8Array): Promise<{ pdf?: Uint8Array | null; ms: number; log?: string; error?: string }> {
  const id = ++xdvSeq;
  return new Promise((resolve) => {
    xdvWaiters.set(id, resolve);
    xdvWorker.postMessage({ id, xdv: bytes }, bytes ? [bytes.buffer] : []);
  });
}

/** Gzipped files committed under static/; some hosts (Vite's dev server) already decode them via Content-Encoding, so only gzip magic bytes are inflated here. */
async function fetchGz(name: string): Promise<Uint8Array> {
  const res = await fetch(`${ENGINE_BASE}/${name}.gz`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} (engine not installed, see scripts/texpresso-spike/)`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function newEngine(fmt: string | null): TexpressoEngine {
  return new TexpressoEngine({ module: module!, tree: tree!, icuData: icu!, format: fmt });
}

const runArgs = () => ['/bin/xelatex', '-no-pdf', '-synctex=-1', '-interaction=nonstopmode', `-fmt=${format}`, 'main.tex'];

/** Our engine reads busytex's format when the build matches; otherwise it dumps its own once (texpresso does that on first run too). */
function ensureFormat(log: string[]): void {
  const probe = newEngine(format);
  probe.inputs.set('main.tex', new TextEncoder().encode('\\documentclass{article}\\begin{document}x\\end{document}\n'));
  const r = probe.runFull(runArgs());
  if (r.outputs.has('/work/main.xdv')) {
    log.push(`format: busytex's xelatex.fmt loads (${r.ms.toFixed(0)} ms probe)`);
    return;
  }
  const t0 = performance.now();
  const ini = newEngine(null);
  const dump = ini.runFull(['/bin/xetex', '-ini', '-etex', '-jobname=xelatex', '-progname=xelatex', 'xelatex.ini']);
  const fmt = dump.outputs.get('/work/xelatex.fmt');
  if (!fmt) throw new Error(`format dump failed:\n${dump.stdout.slice(-2000)}`);
  tree!.add(OWN_FORMAT, fmt);
  format = OWN_FORMAT;
  log.push(`format: busytex's does not load (${r.stdout.match(/Fatal format[^\n]*/)?.[0] ?? `exit ${r.exitCode}`}); dumped our own in ${(performance.now() - t0).toFixed(0)} ms`);
}

async function init(assets: { path: string; content: Uint8Array }[]): Promise<Record<string, unknown>> {
  const t0 = performance.now();
  const [loadedTree, wasm, icuData, xdvReady] = await Promise.all([loadTexTree(), fetchGz('xetex.wasm'), fetchGz('icudt78l.dat'), xdv()]);
  tree = loadedTree;
  icu = icuData;
  const t1 = performance.now();
  module = await WebAssembly.compile(wasm as BufferSource);
  const t2 = performance.now();
  const log: string[] = [];
  ensureFormat(log);
  engine = newEngine(format);
  // Same layout as compiler.worker.ts: assets under their paths, sty/x.sty and sty/x.tex also flat.
  for (const f of assets) {
    engine.inputs.set(f.path, f.content);
    if (f.path.startsWith('sty/') && /\.(sty|tex)$/.test(f.path)) engine.inputs.set(f.path.slice(4), f.content);
  }
  return {
    downloadMs: t1 - t0,
    compileWasmMs: t2 - t1,
    formatMs: performance.now() - t2,
    xdvBootMs: xdvReady.ms,
    treeBytes: tree.bytes,
    treeSources: tree.sources,
    log,
    missingImports: engine.importsMissing,
  };
}

/** One edit: invalidate, resume from the checkpoint before it, then feed changed aux files back like compileUntilStable. */
function typeset(tex: string, full: boolean): { last: RunResult; passes: PassInfo[] } {
  const e = engine!;
  const passes: PassInfo[] = [];
  const at = e.setInput('main.tex', new TextEncoder().encode(tex));
  let last: RunResult;
  if (!hasRun || full) last = e.runFull(runArgs());
  else if (at < 0) last = e.runFull(runArgs());
  else last = e.rerun(at);
  hasRun = true;
  passes.push({ ms: last.ms, resumedFrom: last.resumedFrom });
  for (let pass = 1; pass < MAX_PASSES; pass++) {
    let invalid = Number.POSITIVE_INFINITY;
    for (const name of AUX_FILES) {
      const out = last.outputs.get(`/work/${name}`);
      const prev = e.inputs.get(name);
      if (!out || (prev && sameBytes(prev, out))) continue;
      const i = e.setInput(name, out);
      invalid = Math.min(invalid, i < 0 ? Number.POSITIVE_INFINITY : i);
      // A file the run never looked for still needs a pass when it is new (first compile).
      if (i < 0 && !prev) invalid = 0;
    }
    if (invalid === Number.POSITIVE_INFINITY) break;
    last = e.rerun(invalid);
    passes.push({ ms: last.ms, resumedFrom: last.resumedFrom });
  }
  return { last, passes };
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function compile(id: number, tex: string, full: boolean): Promise<CompileReply> {
  const t0 = performance.now();
  const { last, passes } = typeset(tex, full);
  const t1 = performance.now();
  const xdvBytes = last.outputs.get('/work/main.xdv');
  const log = new TextDecoder().decode(last.outputs.get('/work/main.log') ?? new Uint8Array()) || last.stdout;
  const synctex = new TextDecoder().decode(last.outputs.get('/work/main.synctex') ?? new Uint8Array());
  const stats = engine!.stats();
  const conv = xdvBytes ? await xdv(xdvBytes.slice()) : { pdf: null, ms: 0, error: 'no XDV output' };
  return {
    id,
    pdf: conv.pdf ?? null,
    synctex,
    log: conv.error ? `${log}\n\n${conv.error}\n${conv.log ?? ''}` : log,
    xdvBytes: xdvBytes?.length ?? 0,
    passes,
    engineMs: t1 - t0,
    xdvMs: conv.ms,
    totalMs: performance.now() - t0,
    checkpoints: stats.checkpoints,
    checkpointBytes: stats.checkpointBytes,
    memoryBytes: stats.memoryBytes,
    error: conv.pdf ? undefined : (conv.error ?? 'xdvipdfmx produced no PDF'),
  };
}

/** Per edit: the incremental update, then a fresh full typeset of the same text whose XDV must be byte-identical. */
async function bench(base: string, edits: { label: string; tex: string }[]): Promise<BenchRow[]> {
  const rows: BenchRow[] = [];
  const assets = [...engine!.inputs].filter(([k]) => !k.startsWith('main.'));
  typeset(base, false);
  for (const edit of edits) {
    const t0 = performance.now();
    const inc = typeset(edit.tex, false);
    const engineMs = performance.now() - t0;
    const stats = engine!.stats();
    const xdvInc = inc.last.outputs.get('/work/main.xdv');
    const conv = xdvInc ? await xdv(xdvInc.slice()) : { ms: 0 };
    // Fresh engine, same assets, no aux: what a full compile of the edited text does.
    const saved = engine!;
    engine = newEngine(format);
    for (const [k, v] of assets) engine.inputs.set(k, v);
    const hadRun = hasRun;
    hasRun = false;
    const t1 = performance.now();
    const full = typeset(edit.tex, true);
    const fullEngineMs = performance.now() - t1;
    engine = saved;
    hasRun = hadRun;
    const xdvFull = full.last.outputs.get('/work/main.xdv');
    rows.push({
      label: edit.label,
      passes: inc.passes,
      engineMs,
      xdvMs: conv.ms,
      fullEngineMs,
      fullPasses: full.passes.length,
      identicalXdv: !!xdvInc && !!xdvFull && sameBytes(xdvInc, xdvFull),
      checkpoints: stats.checkpoints,
      checkpointBytes: stats.checkpointBytes,
    });
    typeset(base, false);
  }
  return rows;
}

let queue: Promise<void> = Promise.resolve();
self.onmessage = (e: MessageEvent<SpikeRequest>) => {
  const msg = e.data;
  queue = queue.then(async () => {
    try {
      if (msg.type === 'init') self.postMessage({ id: msg.id, init: await init(msg.assets) });
      else if (msg.type === 'bench') self.postMessage({ id: msg.id, bench: await bench(msg.base, msg.edits) });
      else {
        const reply = await compile(msg.id, msg.tex, msg.full === true);
        self.postMessage(reply, reply.pdf ? [reply.pdf.buffer] : []);
      }
    } catch (err) {
      self.postMessage({ id: msg.id, error: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err) });
    }
  });
};
