/// <reference lib="webworker" />
/**
 * The browser LaTeX engine (issue #346): XeTeX with checkpoints per document session, then xdvipdfmx, on the server's TeX Live tree.
 * Protocol (compiler.ts): {type:'assets'}, {type:'preload'}, {id, latexSource, resources, seedAux, session?}; answers {id, status},
 * {type:'download', …}, {id, success, pdfBytes, missingGraphics, aux} or {id, success:false, error, log, unavailable?}, and asks
 * {type:'tree-request', reqId, kind, path?} for TeX Live files, which the main thread fetches through the authenticated API client.
 */
import { BIN_DIR, DEFAULT_MEMORY_BUDGET, EngineUnavailableError, TexEngine, type RunResult } from './engine/engine';
import { idb, LazyTree, TREE_ROOT, type TreeManifest, type TreeSource } from './engine/tree';
import { dumpSource, formatKey, splitPreamble, TEX_FLAGS, withFormat } from './engine/format';
import { pdfInputs } from './engine/pdfStep';
import { compileLogForUser, describeCompileFailure, extractMissingGraphics, type CompileStep } from './compileLog';
import templateFiles from './engine/templateFiles.json';
import { sha256Hex } from '#lib/crypto/hex';
import engineSums from '../../../static/core/latex-engine/SHA256SUMS?raw';

const ENGINE_BASE = '/core/latex-engine';
const AUX_FILES = ['main.aux', 'main.toc', 'main.out'];
/** Same limit as the server (texrunner MAX_TEX_PASSES). */
const MAX_TEX_PASSES = 4;
const MAX_AUX_FILE_BYTES = 512 * 1024;
/** Few-GB devices keep one live session and a lower budget; elsewhere the exercise editor's task sheet and solution each keep theirs. */
const lowMemory = ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
const MAX_SESSIONS = lowMemory ? 1 : 2;
const SESSION_BUDGET = lowMemory ? 500 * 2 ** 20 : DEFAULT_MEMORY_BUDGET;

// --- TeX Live files through the main thread ------------------------------------------------

let treeReq = 0;
const treeWaiters = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function askMain<T>(msg: { kind: 'manifest' } | { kind: 'file'; path: string; version: string }): Promise<T> {
  const reqId = ++treeReq;
  return new Promise<T>((resolve, reject) => {
    treeWaiters.set(reqId, { resolve: resolve as (v: unknown) => void, reject });
    self.postMessage({ type: 'tree-request', reqId, ...msg });
  });
}

const source: TreeSource = {
  manifest: () => askMain<TreeManifest>({ kind: 'manifest' }),
  file: (path, version) => askMain<Uint8Array>({ kind: 'file', path, version }),
};

// --- boot -----------------------------------------------------------------------------------

interface Runtime {
  tree: LazyTree;
  xetex: WebAssembly.Module;
  xdvipdfmx: WebAssembly.Module;
  icu: Uint8Array;
}

let runtime: Promise<Runtime> | null = null;

/** Gzipped engine files committed under static/; a host that already decoded them (Content-Encoding) gets them as they are. */
/** The committed checksums of the uncompressed engine files (written by build-engine.sh). */
const ENGINE_SUMS = new Map(
  engineSums
    .trim()
    .split('\n')
    .map((line) => line.split(/\s+/) as [string, string])
    .map(([sum, name]) => [name, sum]),
);

/** An engine file, inflated and checked against the checksum bundled with this build, so only the engine we built ever runs. */
async function fetchGz(name: string, onBytes: (n: number) => void): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(`${ENGINE_BASE}/${name}.gz`);
  if (!res.ok) throw new Error(`LaTeX engine file ${name}: HTTP ${res.status}`);
  let bytes = new Uint8Array(await res.arrayBuffer());
  onBytes(bytes.length);
  // A dev server may already have inflated it (Content-Encoding).
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  if ((await sha256Hex(bytes)) !== ENGINE_SUMS.get(name)) throw new Error(`LaTeX engine file ${name}: checksum mismatch`);
  return bytes;
}

/** Engine files plus the template's TeX Live files, reported as one download for the loading dialog. */
async function bootRuntime(): Promise<Runtime> {
  const tree = await LazyTree.open(source);
  const template = (templateFiles as string[]).map((p) => `${TREE_ROOT}/${p}`);
  const engineBytes = 13 * 2 ** 20;
  const total = engineBytes + template.reduce((n, p) => n + Math.max(0, tree.size(p)), 0);
  let loaded = 0;
  const report = (n: number) => {
    loaded += n;
    self.postMessage({ type: 'download', phase: 'download', loaded: Math.min(loaded, total), total, cached: false });
  };
  const fetchedBefore = tree.fetchedBytes;
  const [xetex, xdvipdfmx, icu] = await Promise.all([
    fetchGz('xetex.wasm', report).then((b) => WebAssembly.compile(b)),
    fetchGz('xdvipdfmx.wasm', report).then((b) => WebAssembly.compile(b)),
    fetchGz('icudt78l.dat', report),
    tree.prefetch(template).then(() => report(tree.fetchedBytes - fetchedBefore)),
  ]);
  self.postMessage({ type: 'download', done: true });
  return { tree, xetex, xdvipdfmx, icu };
}

function boot(): Promise<Runtime> {
  runtime ??= bootRuntime().catch((err) => {
    runtime = null;
    self.postMessage({ type: 'download', done: true });
    throw err;
  });
  return runtime;
}

// --- assets ---------------------------------------------------------------------------------

/** The bundled LaTeX assets, posted once by the main thread; `sty/x.sty` and `sty/x.tex` are also exposed flat (`\input x.tex`). */
let assets: { path: string; content: Uint8Array }[] = [];
let assetsDigest = '';

async function setAssets(files: { path: string; content: Uint8Array }[]): Promise<void> {
  assets = files.flatMap((file) =>
    file.path.startsWith('sty/') && /\.(sty|tex)$/.test(file.path) ? [file, { path: file.path.replace('sty/', ''), content: file.content }] : [file]
  );
  const parts = [...assets].sort((a, b) => (a.path < b.path ? -1 : 1)).flatMap((f) => [new TextEncoder().encode(`${f.path}\0`), f.content]);
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  assetsDigest = await sha256Hex(all);
}

// --- formats per preamble (issue #344) --------------------------------------------------------

const FORMAT_DB = 'examance-latex-formats';
const MAX_FORMATS = 8;
const failedFormats = new Set<string>();

async function formatDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve) => {
    const req = indexedDB.open(FORMAT_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('formats');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

/** Formats hold no workspace data (template and package code only), so they live outside the encrypted vault; least recently used go first. */
async function storeFormat(key: string, bytes: Uint8Array): Promise<void> {
  const db = await formatDb();
  if (!db) return;
  try {
    const store = db.transaction('formats', 'readwrite').objectStore('formats');
    store.put({ bytes, used: Date.now() }, key);
    const keys = (await idb(store.getAllKeys())) as string[];
    if (keys.length > MAX_FORMATS) {
      const all = (await idb(db.transaction('formats').objectStore('formats').getAll())) as { used: number }[];
      const order = keys.map((k, i) => [k, all[i].used] as const).sort((a, b) => a[1] - b[1]);
      const tx = db.transaction('formats', 'readwrite');
      for (const [k] of order.slice(0, keys.length - MAX_FORMATS)) tx.objectStore('formats').delete(k);
    }
  } finally {
    db.close();
  }
}

async function loadFormat(key: string): Promise<Uint8Array | null> {
  const db = await formatDb();
  if (!db) return null;
  try {
    const hit = (await idb(db.transaction('formats').objectStore('formats').get(key))) as { bytes: Uint8Array } | undefined;
    if (hit) db.transaction('formats', 'readwrite').objectStore('formats').put({ bytes: hit.bytes, used: Date.now() }, key);
    return hit?.bytes ?? null;
  } finally {
    db.close();
  }
}

/** The format for `preamble` (built once, then from IndexedDB), or null when it cannot be built; the compile then runs without it, like on the server. */
async function formatFor(rt: Runtime, preamble: string): Promise<string | null> {
  const key = await formatKey(rt.tree.version, assetsDigest, preamble);
  const path = `/fmt/${key}.fmt`;
  if (rt.tree.cached(path)) return path;
  if (failedFormats.has(key)) return null;
  const stored = await loadFormat(key);
  if (stored) {
    rt.tree.add(path, stored);
    return path;
  }
  const engine = new TexEngine({ module: rt.xetex, tree: rt.tree, icuData: rt.icu, format: null, incremental: false });
  for (const f of assets) engine.inputs.set(f.path, f.content);
  engine.inputs.set('fmt.tex', new TextEncoder().encode(dumpSource(preamble)));
  const r = await engine.runFull([`${BIN_DIR}/xelatex`, '-ini', ...TEX_FLAGS, `-jobname=${key}`, '&xelatex', 'mylatexformat.ltx', 'fmt.tex']);
  const fmt = r.exitCode === 0 ? r.outputs.get(`/work/${key}.fmt`) : undefined;
  if (!fmt) {
    // A preamble the format cannot hold (a package loads a native font at load time) still compiles, just without the head start.
    failedFormats.add(key);
    return null;
  }
  rt.tree.add(path, fmt);
  void storeFormat(key, fmt);
  return path;
}

// --- sessions -------------------------------------------------------------------------------

interface Session {
  engine: TexEngine;
  ran: boolean;
  format: string | null;
  resources: Set<string>;
}

/** Live engines by cache slot (least recently used first); a compile without a slot gets a throwaway engine without checkpoints. */
const sessions = new Map<string, Session>();

function newSession(rt: Runtime, incremental: boolean, format: string | null): Session {
  const engine = new TexEngine({ module: rt.xetex, tree: rt.tree, icuData: rt.icu, format, incremental, memoryBudget: SESSION_BUDGET });
  for (const f of assets) engine.inputs.set(f.path, f.content);
  return { engine, ran: false, format, resources: new Set() };
}

function sessionFor(rt: Runtime, key: string | undefined, format: string | null): Session {
  if (!key) return newSession(rt, false, format);
  const existing = sessions.get(key);
  sessions.delete(key);
  // A different format means a different preamble: the old checkpoints describe another document.
  const s = existing?.format === format ? existing : newSession(rt, true, format);
  sessions.set(key, s);
  while (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value as string);
  return s;
}

// --- compile --------------------------------------------------------------------------------

interface CompileRequest {
  id: number;
  latexSource: string;
  resources?: { filename: string; content: Uint8Array }[];
  seedAux?: { path: string; content: Uint8Array }[];
  session?: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Puts the document, its resources and (for a fresh session) the aux seeds in; the earliest trace index they invalidate, or -1. */
function feedInputs(s: Session, req: CompileRequest, tex: string): number {
  const e = s.engine;
  let invalid = -1;
  const note = (i: number) => {
    if (i >= 0) invalid = invalid < 0 ? i : Math.min(invalid, i);
  };
  // Teacher resources go in flat and never over a bundled asset (lib/latex/resources.ts refuses such names at upload; this is the second line).
  const bundled = new Set(assets.map((a) => a.path));
  const now = new Set<string>();
  for (const r of req.resources ?? []) {
    if (bundled.has(r.filename)) continue;
    now.add(r.filename);
    note(e.setInput(r.filename, r.content));
  }
  for (const gone of s.resources) if (!now.has(gone)) note(e.deleteInput(gone));
  s.resources = now;
  if (!s.ran) for (const a of req.seedAux ?? []) if (AUX_FILES.includes(a.path)) e.setInput(a.path, a.content);
  note(e.setInput('main.tex', enc.encode(tex)));
  return invalid;
}

/** Makes the run's changed aux files the next inputs; the earliest trace index they invalidate, or null when all settled. */
function feedAux(e: TexEngine, last: RunResult): number | null {
  let invalid: number | null = null;
  for (const name of AUX_FILES) {
    const out = last.outputs.get(`/work/${name}`);
    const prev = e.inputs.get(name);
    if (!out || (prev && sameBytes(prev, out))) continue;
    const i = e.setInput(name, out);
    // A file the run never looked for still needs a pass when it is new (first compile).
    const at = i < 0 && !prev ? 0 : i;
    if (at >= 0) invalid = invalid === null ? at : Math.min(invalid, at);
  }
  return invalid;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Durations and counts only (never content), for the compile's console line and tests. */
interface Timings {
  formatMs: number;
  format: 'none' | 'cached' | 'dumped';
  passes: { ms: number; from: 'start' | number }[];
  pdfMs: number;
  checkpoints?: number;
  mode?: string;
  checkpointMB?: number;
}

async function typeset(s: Session, req: CompileRequest, tex: string, args: string[], t: Timings): Promise<RunResult> {
  const invalid = feedInputs(s, req, tex);
  // Nothing the last run read changed: resume from the last checkpoint and replay only the tail.
  const from = invalid < 0 ? Number.POSITIVE_INFINITY : invalid;
  let last = s.ran ? await s.engine.rerun(from) : await s.engine.runFull(args);
  s.ran = true;
  t.passes.push({ ms: last.ms, from: last.resumedFrom });
  for (let pass = 1; pass < MAX_TEX_PASSES && last.exitCode === 0; pass++) {
    const at = feedAux(s.engine, last);
    if (at === null) break;
    last = await s.engine.rerun(at); // NOSONAR: each pass reads the aux files of the one before
    t.passes.push({ ms: last.ms, from: last.resumedFrom });
  }
  return last;
}

async function toPdf(rt: Runtime, s: Session, xdv: Uint8Array): Promise<{ pdf: Uint8Array | undefined; step: CompileStep }> {
  const engine = new TexEngine({ module: rt.xdvipdfmx, tree: rt.tree, icuData: rt.icu, format: null, incremental: false });
  for (const [name, bytes] of pdfInputs(s.engine.inputs, xdv)) engine.inputs.set(name, bytes);
  const cmd = [`${BIN_DIR}/xdvipdfmx`, '-q', '-E', '-o', 'main.pdf', 'main.xdv'];
  const r = await engine.runFull(cmd);
  return { pdf: r.exitCode === 0 ? r.outputs.get('/work/main.pdf') : undefined, step: { cmd: cmd.join(' '), stdout: r.stdout, exit_code: r.exitCode } };
}

async function compile(req: CompileRequest): Promise<void> {
  const rt = await boot();
  self.postMessage({ id: req.id, status: 'compiling' });
  const t: Timings = { formatMs: 0, format: 'none', passes: [], pdfMs: 0 };
  const t0 = performance.now();
  const parts = splitPreamble(req.latexSource);
  const known = parts ? rt.tree.size(`/fmt/${await formatKey(rt.tree.version, assetsDigest, parts[0])}.fmt`) >= 0 : false;
  const format = parts ? await formatFor(rt, parts[0]) : null;
  t.formatMs = performance.now() - t0;
  if (format) t.format = known ? 'cached' : 'dumped';
  const tex = format && parts ? withFormat(parts[0], parts[1]) : req.latexSource;
  const args = [`${BIN_DIR}/xelatex`, '-no-pdf', '-synctex=-1' /* read by click-to-source, issue #347 */, ...TEX_FLAGS, `-fmt=${format ?? 'xelatex'}`, 'main.tex'];
  let s = sessionFor(rt, req.session, format);
  let last = await typeset(s, req, tex, args, t);
  // A stale seed (a macro the document no longer defines) must not fail the compile: retry once from scratch, as the server does.
  if (last.exitCode !== 0 && (req.seedAux ?? []).length > 0) {
    if (req.session) sessions.delete(req.session);
    s = sessionFor(rt, req.session, format);
    last = await typeset(s, { ...req, seedAux: [] }, tex, args, t);
  }
  await finish(rt, req, s, last, args, t);
}

/** xdvipdfmx after a successful XeTeX run, then the answer: the PDF with aux files and missing figures, or the failure with its log. */
async function finish(rt: Runtime, req: CompileRequest, s: Session, last: RunResult, args: string[], t: Timings): Promise<void> {
  const log = dec.decode(last.outputs.get('/work/main.log') ?? new Uint8Array()) || last.stdout;
  const xetexStep: CompileStep = { cmd: args.join(' '), log, stdout: last.stdout, exit_code: last.exitCode };
  const xdv = last.outputs.get('/work/main.xdv');
  const st = s.engine.stats();
  t.checkpoints = st.checkpoints;
  t.mode = st.mode;
  t.checkpointMB = Math.round(st.checkpointBytes / 2 ** 20);
  const tp = performance.now();
  const pdf = xdv && last.exitCode === 0 ? await toPdf(rt, s, xdv) : null;
  t.pdfMs = performance.now() - tp;
  if (!pdf?.pdf) {
    const steps = [xetexStep, ...(pdf ? [pdf.step] : [])];
    const failure = { log: pdf?.step.stdout || log, logs: steps };
    self.postMessage({ id: req.id, success: false, error: describeCompileFailure(failure), log: compileLogForUser(failure), timings: t });
    return;
  }
  const aux = AUX_FILES.flatMap((name) => {
    const bytes = last.outputs.get(`/work/${name}`);
    return bytes && bytes.length <= MAX_AUX_FILE_BYTES ? [{ path: name, content: bytes }] : [];
  });
  self.postMessage({ id: req.id, success: true, pdfBytes: pdf.pdf, missingGraphics: extractMissingGraphics(log), aux, timings: t }, [pdf.pdf.buffer]);
}

let queue: Promise<void> = Promise.resolve();

async function preload(): Promise<void> {
  try {
    await boot();
  } catch (err) {
    console.warn('[CompilerWorker] Preload failed; the first compile will retry.', err);
  }
}

self.onmessage = (e: MessageEvent) => {
  const data = e.data;
  if (data?.type === 'tree-reply') {
    const w = treeWaiters.get(data.reqId);
    treeWaiters.delete(data.reqId);
    if (data.error) w?.reject(new Error(data.error));
    else w?.resolve(data.value);
    return;
  }
  if (data?.type === 'assets') {
    queue = queue.then(() => setAssets(data.files));
    return;
  }
  if (data?.type === 'preload') {
    // A failed boot only costs the head start; the first compile retries it.
    queue = queue.then(preload);
    return;
  }
  const req = data as CompileRequest;
  queue = queue.then(async () => {
    try {
      await compile(req);
    } catch (err) {
      // The engine is in an unknown state: drop the session, so the next compile starts clean (the old resetRunner rule).
      if (req.session) sessions.delete(req.session);
      const message = err instanceof Error ? err.message : String(err);
      self.postMessage({ id: req.id, success: false, error: message, unavailable: err instanceof EngineUnavailableError });
    }
  });
};
