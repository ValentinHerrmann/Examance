/**
 * The browser LaTeX engine's host (issue #346): runs the asyncified XeTeX and xdvipdfmx of scripts/latex-engine/build-engine.sh.
 * Ported from src/engine-wasm/wasm_host.c of let-def/texpresso (eclipse, MIT). Design and measurements: docs/dev/latex_performance.md.
 * At an fd_read the engine can unwind (Asyncify): to take a checkpoint (a copy of the pages that changed) or to wait for a tree file.
 * Restoring a checkpoint writes the memory back and rewinds into the same fd_read, so TeX resumes there with no native stack to copy.
 */
import { TREE_ROOT, type Tree } from './tree';
import { firstInvalidated, type TraceEntry } from './trace';

// Emscripten's musl uses WASI errno numbers (texpresso's C host returns Linux ones).
const E = { ACCES: 2, BADF: 8, EXIST: 20, INVAL: 28, IO: 29, ISDIR: 31, NOENT: 44, NOSYS: 52, NOTDIR: 54, NOTTY: 59, SPIPE: 70 };
const O_ACCMODE = 3, O_TRUNC = 0o1000, O_APPEND = 0o2000;
const AT_FDCWD = -100;
const S_IFDIR = 0o040000, S_IFREG = 0o100000;
const PAGE = 4096;
const EMPTY = new Uint8Array(0);
const CWD = '/work';
/** argv[0]: kpathsea derives SELFAUTOPARENT (= the tree root) from it, as for the server's own binary. */
export const BIN_DIR = `${TREE_ROOT}/bin/x86_64-linux`;
/** Our runner's texmf.cnf, read before the distribution's (TEXMFCNF ends in ":"), as on the server. */
const EXAMANCE_CNF_DIR = `${TREE_ROOT}/examance`;
/** Default budget for engine memory plus checkpoints; above it a session runs without checkpoints. */
export const DEFAULT_MEMORY_BUDGET = 900 * 2 ** 20;

/** The engine cannot run here (no memory for an instance): callers fall back to the server engine where allowed. */
export class EngineUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineUnavailableError';
  }
}
/** Fixed wall clock for determinism (2026-01-01T00:00:00Z); TeX's \today, random seed and file dates derive from it. */
export const EPOCH = 1767225600;

class ExitSignal {
  readonly code: number;
  constructor(code: number) {
    this.code = code;
  }
}
/** Thrown by `_emscripten_throw_longjmp`, caught by the invoke_* wrappers (emscripten's JS setjmp/longjmp ABI). */
const LONGJMP = Symbol('longjmp');

type Exports = Record<string, any> & { memory: WebAssembly.Memory };

/** A file the engine wrote; `frozen` is the length a checkpoint holds, writes below it copy the buffer first. */
interface OutFile {
  data: Uint8Array;
  len: number;
  frozen: number;
}
interface Fd {
  path: string;
  kind: 'tree' | 'input' | 'output' | 'dir';
  /** Null for a tree file not fetched yet: the first read unwinds and waits for it. */
  data: Uint8Array | null;
  out: OutFile | null;
  pos: number;
  size: number;
}

interface Checkpoint {
  traceLen: number;
  at: number;
  /** Layer 0: full pages (shared with the shadow until a page changes again). Later layers: sparse XOR against the previous checkpoint (encodeXor). */
  pages: Map<number, Uint32Array | Uint8Array>;
  /** Hash of every page at this checkpoint; the next layer is the pages whose hash moved. */
  hashes: Uint32Array;
  memBytes: number;
  sp: number;
  fds: Map<number, Fd>;
  nextFd: number;
  outputs: Map<string, OutFile>;
  stdoutLen: number;
}

export interface RunResult {
  exitCode: number;
  /** Wall time of this run in ms, including the restore. */
  ms: number;
  resumedFrom: 'start' | number;
  outputs: Map<string, Uint8Array>;
  stdout: string;
}

export interface EngineStats {
  checkpoints: number;
  /** XOR layers plus the shadow copy of the last checkpoint. */
  checkpointBytes: number;
  memoryBytes: number;
  /** 'full' once the memory budget was exceeded: no checkpoints, every edit runs from the start. */
  mode: 'incremental' | 'full';
  /** Time spent taking checkpoints in the last run (page hashing and copies). */
  checkpointMs: number;
}

export interface EngineOptions {
  module: WebAssembly.Module;
  tree: Tree;
  icuData: Uint8Array;
  /** Format path inside the tree, or null for an -ini run. */
  format: string | null;
  /** Minimum engine time between checkpoints in ms. */
  checkpointEveryMs?: number;
  maxCheckpoints?: number;
  /** Engine memory plus checkpoint bytes above which the session stops taking checkpoints. */
  memoryBudget?: number;
  /** False for documents compiled once (no edit expected): no checkpoints at all. */
  incremental?: boolean;
}

const ASYNC_UNWINDING = 1;
const ASYNC_DATA_SIZE = 4 * 1024 * 1024;

export class TexEngine {
  private exports!: Exports;
  private instance!: WebAssembly.Instance;
  private mem!: Uint8Array;
  private dv!: DataView;
  private readonly tree: Tree;
  /** Page contents at the last checkpoint, for the next layer's XOR; null without checkpoints. */
  private shadow: Map<number, Uint8Array> | null = null;
  /** Shadow pages that are also layer 0's pages, so they are never overwritten in place. */
  private sharedPages = new Set<Uint8Array>();
  private layerBytes = 0;
  private mode: EngineStats['mode'] = 'incremental';
  private pendingFetch: Fd | null = null;
  readonly inputs = new Map<string, Uint8Array>();
  private outputs = new Map<string, OutFile>();
  private fds = new Map<number, Fd>();
  private nextFd = 3;
  private trace: TraceEntry[] = [];
  private stdout: string[] = [];
  private checkpoints: Checkpoint[] = [];
  private spacing = 0;
  private linesSinceCheckpoint = 0;
  private hashPage: ((page: number) => number) | null = null;
  private checkpointMs = 0;
  private asyncData = 0;
  private rewinding = false;
  private formatLoaded = false;
  private lastCheckpointAt = 0;
  private runStartedAt = 0;
  private argv: string[] = [];
  private argvPtr = 0;
  private finished = true;
  private readonly opts: Required<EngineOptions>;
  private readonly icuPath = '/icu/icudt78l.dat';
  private readonly unknownImports = new Set<string>();

  constructor(opts: EngineOptions) {
    this.opts = { checkpointEveryMs: 150, maxCheckpoints: 12, memoryBudget: DEFAULT_MEMORY_BUDGET, incremental: true, ...opts };
    this.tree = opts.tree;
    if (!this.opts.incremental) this.mode = 'full';
  }

  /** A full run from the beginning in a fresh instance (also the -ini format dump when `format` is null). */
  async runFull(args: string[]): Promise<RunResult> {
    const t0 = performance.now();
    this.instantiate();
    this.argv = args;
    this.argvPtr = this.writeArgv(args);
    this.checkpoints = [];
    this.shadow = this.mode === 'incremental' ? new Map() : null;
    this.sharedPages = new Set();
    this.layerBytes = 0;
    this.spacing = this.opts.checkpointEveryMs;
    this.checkpointMs = 0;
    this.trace = [];
    this.stdout = [];
    this.outputs = new Map();
    this.fds = new Map();
    this.nextFd = 3;
    this.formatLoaded = false;
    this.runStartedAt = performance.now();
    this.lastCheckpointAt = this.runStartedAt;
    const exitCode = await this.drive(false);
    return this.result(exitCode, t0, 'start');
  }

  /** Replaces an input; returns the trace index of the first read or lookup the change invalidates, or -1 when the last run never saw it. */
  setInput(path: string, bytes: Uint8Array): number {
    const old = this.inputs.get(path);
    this.inputs.set(path, bytes);
    return firstInvalidated(this.trace, path, old, bytes);
  }

  /** Removes an input; the trace index of the first lookup or read of it, or -1 when the last run never saw it. */
  deleteInput(path: string): number {
    const old = this.inputs.get(path);
    if (!this.inputs.delete(path)) return -1;
    return firstInvalidated(this.trace, path, old, undefined);
  }

  /** Resumes from the last checkpoint taken before trace index `invalidAt`, or does a full run when none fits. */
  async rerun(invalidAt: number): Promise<RunResult> {
    const t0 = performance.now();
    let k = -1;
    for (let i = this.checkpoints.length - 1; i >= 0; i--) {
      if (this.checkpoints[i].traceLen <= invalidAt) {
        k = i;
        break;
      }
    }
    if (k < 0 || this.finished === false) return this.runFull(this.argv);
    this.restore(this.checkpoints[k]);
    this.dropLayersAfter(k);
    this.runStartedAt = performance.now() - this.checkpoints[k].at;
    this.lastCheckpointAt = performance.now();
    const exitCode = await this.drive(true);
    return this.result(exitCode, t0, k);
  }

  /** Distinct full pages (layer 0 and the shadow share most of them) plus the sparse layers. */
  private snapshotBytes(): number {
    let unshared = 0;
    for (const page of this.shadow?.values() ?? []) if (!this.sharedPages.has(page)) unshared++;
    return (this.sharedPages.size + unshared) * PAGE + this.layerBytes;
  }

  stats(): EngineStats {
    return {
      checkpoints: this.checkpoints.length,
      checkpointBytes: this.snapshotBytes(),
      memoryBytes: this.mem?.byteLength ?? 0,
      mode: this.mode,
      checkpointMs: this.checkpointMs,
    };
  }

  get importsMissing(): string[] {
    return [...this.unknownImports];
  }

  // --- run loop -----------------------------------------------------------

  /** Runs the engine until it exits; an unwind is either a checkpoint or a tree file to wait for. */
  private async drive(resume: boolean): Promise<number> {
    this.finished = false;
    this.rewinding = resume;
    if (resume) this.exports.asyncify_start_rewind(this.asyncData);
    for (;;) {
      try {
        const ret = this.entry(this.argv.length, this.argvPtr) as number;
        if (this.exports.asyncify_get_state() === ASYNC_UNWINDING) {
          this.exports.asyncify_stop_unwind();
          const fetch = this.pendingFetch;
          this.pendingFetch = null;
          if (fetch) await this.fetchInto(fetch);
          else this.takeCheckpoint();
          this.rewinding = true;
          this.exports.asyncify_start_rewind(this.asyncData);
          continue;
        }
        this.finished = true;
        return ret;
      } catch (err) {
        if (err instanceof ExitSignal) {
          this.finished = true;
          return err.code;
        }
        throw err;
      }
    }
  }

  /** Waits for a tree file the engine began to read; the time spent waiting does not count as engine time. */
  private async fetchInto(f: Fd): Promise<void> {
    const t0 = performance.now();
    f.data = await this.tree.load(f.path);
    const waited = performance.now() - t0;
    this.lastCheckpointAt += waited;
    this.runStartedAt += waited;
  }

  /** A layer holds the XOR of the pages whose hash moved since the previous checkpoint, against the shadow copy of that checkpoint. */
  private takeCheckpoint(): void {
    const t0 = performance.now();
    const mem = this.mem;
    const total = mem.byteLength / PAGE;
    const prev = this.checkpoints.at(-1)?.hashes;
    const hashes = new Uint32Array(total);
    const pages = new Map<number, Uint32Array | Uint8Array>();
    const hash = this.hashPage!;
    const words = new Int32Array(mem.buffer, 0, mem.byteLength >> 2);
    const first = this.checkpoints.length === 0;
    for (let p = 0; p < total; p++) {
      const h = hash(p);
      hashes[p] = h;
      // A page new since growth counts as moved unless it is zero.
      const before = prev && p < prev.length ? prev[p] : zeroPageHash;
      if (h === before) continue;
      if (first) this.firstLayerPage(p, pages);
      else this.layerPage(p, pages, words);
    }
    for (const f of this.outputs.values()) f.frozen = Math.max(f.frozen, f.len);
    const { fds, outputs } = cloneState(this.fds, this.outputs);
    this.checkpoints.push({
      traceLen: this.trace.length,
      at: performance.now() - this.runStartedAt,
      pages,
      hashes,
      memBytes: mem.byteLength,
      sp: this.exports.emscripten_stack_get_current(),
      fds,
      nextFd: this.nextFd,
      outputs,
      stdoutLen: this.stdout.length,
    });
    this.thin();
    this.checkpointMs += performance.now() - t0;
    if (this.mem.byteLength + this.snapshotBytes() > this.opts.memoryBudget) this.goFull();
    // Never spend more than about a sixth of the engine's time on checkpoints.
    this.spacing = Math.max(this.opts.checkpointEveryMs, 5 * (performance.now() - t0));
    this.lastCheckpointAt = performance.now();
    this.linesSinceCheckpoint = 0;
  }

  /** The first layer shares its pages with the shadow; a shared page is copied once it changes again (copy on write). */
  private firstLayerPage(p: number, pages: Map<number, Uint32Array | Uint8Array>): void {
    const copy = this.mem.slice(p * PAGE, (p + 1) * PAGE);
    pages.set(p, copy);
    this.shadow!.set(p, copy);
    this.sharedPages.add(copy);
  }

  /** A later layer stores the page's XOR against its shadow copy, then brings the shadow up to date. */
  private layerPage(p: number, pages: Map<number, Uint32Array | Uint8Array>, words: Int32Array): void {
    const shadow = this.shadow!;
    const old = shadow.get(p);
    const delta = encodeXor(words, p * (PAGE >> 2), old ? new Int32Array(old.buffer, old.byteOffset, PAGE >> 2) : null);
    if (delta.length > 0) {
      pages.set(p, delta);
      this.layerBytes += delta.byteLength;
    }
    if (old && !this.sharedPages.has(old)) old.set(this.mem.subarray(p * PAGE, (p + 1) * PAGE));
    else shadow.set(p, this.mem.slice(p * PAGE, (p + 1) * PAGE));
  }

  /** Over the memory budget: the session keeps no checkpoints and every edit runs from the start. */
  private goFull(): void {
    this.mode = 'full';
    this.checkpoints = [];
    this.shadow = null;
    this.sharedPages = new Set();
    this.layerBytes = 0;
  }

  /** Keeps the count bounded by dropping every other checkpoint of the older half; a dropped layer is folded into the next one. */
  private thin(): void {
    if (this.checkpoints.length <= this.opts.maxCheckpoints) return;
    const half = this.checkpoints.length >> 1;
    for (let i = half - 1; i >= 1; i -= 2) {
      const dropped = this.checkpoints[i];
      const next = this.checkpoints[i + 1];
      for (const [p, d] of dropped.pages) {
        const delta = d as Uint32Array;
        const later = next.pages.get(p) as Uint32Array | undefined;
        const merged = later ? combineXor(delta, later) : delta;
        this.layerBytes += merged.byteLength - delta.byteLength - (later?.byteLength ?? 0);
        if (merged.length > 0) next.pages.set(p, merged);
        else next.pages.delete(p);
      }
      this.checkpoints.splice(i, 1);
    }
  }

  private dropLayersAfter(k: number): void {
    for (const c of this.checkpoints.slice(k + 1)) for (const d of c.pages.values()) if (d instanceof Uint32Array) this.layerBytes -= d.byteLength;
    this.checkpoints.length = k + 1;
  }

  /** Zeroes memory, then XORs layers 0..k onto it in order; the shadow becomes the restored pages. */
  private restore(c: Checkpoint): void {
    const k = this.checkpoints.indexOf(c);
    if (this.mem.byteLength < c.memBytes) this.grow(c.memBytes);
    this.mem.fill(0);
    const words = new Int32Array(this.mem.buffer, 0, this.mem.byteLength >> 2);
    const touched = new Set<number>();
    for (let i = 0; i <= k; i++) {
      for (const [p, delta] of this.checkpoints[i].pages) {
        if (delta instanceof Uint8Array) this.mem.set(delta, p * PAGE);
        else applyXor(words, p * (PAGE >> 2), delta);
        touched.add(p);
      }
    }
    // Restored pages are fresh copies; layer 0 keeps its own, so nothing is shared any more.
    this.shadow = new Map([...touched].map((p) => [p, this.mem.slice(p * PAGE, (p + 1) * PAGE)]));
    this.sharedPages = new Set();
    this.exports._emscripten_stack_restore(c.sp);
    ({ fds: this.fds, outputs: this.outputs } = cloneState(c.fds, c.outputs));
    // Open inputs read on from the current text: it equals the old one up to the invalidated read, which comes after this checkpoint.
    for (const f of this.fds.values()) if (f.kind === 'input') f.data = this.inputs.get(f.path.slice(CWD.length + 1)) ?? f.data;
    this.nextFd = c.nextFd;
    this.trace.length = c.traceLen;
    this.stdout.length = c.stdoutLen;
  }

  private result(exitCode: number, t0: number, resumedFrom: RunResult['resumedFrom']): RunResult {
    const outputs = new Map<string, Uint8Array>();
    for (const [p, f] of this.outputs) outputs.set(p, f.data.slice(0, f.len));
    return { exitCode, ms: performance.now() - t0, resumedFrom, outputs, stdout: this.stdout.join('') };
  }

  // --- instance -----------------------------------------------------------

  private instantiate(): void {
    const imports: Record<string, Record<string, unknown>> = {};
    for (const imp of WebAssembly.Module.imports(this.opts.module)) {
      if (imp.kind !== 'function') continue;
      const ns = imports[imp.module] ?? {};
      ns[imp.name] = this.importFor(imp.module, imp.name);
      imports[imp.module] = ns;
    }
    try {
      this.instance = new WebAssembly.Instance(this.opts.module, imports as WebAssembly.Imports);
    } catch (err) {
      // An instance needs 128 MB of linear memory up front; a RangeError means the browser would not give it.
      if (err instanceof RangeError) throw new EngineUnavailableError(err.message);
      throw err;
    }
    this.exports = this.instance.exports as Exports;
    this.refreshViews();
    this.hashPage = pageHasher(this.exports.memory);
    this.exports.emscripten_stack_init?.();
    this.exports.__wasm_call_ctors?.();
    this.asyncData = this.exports.malloc(ASYNC_DATA_SIZE + 8);
    this.dv.setUint32(this.asyncData, this.asyncData + 8, true);
    this.dv.setUint32(this.asyncData + 4, this.asyncData + 8 + ASYNC_DATA_SIZE, true);
  }

  /** Emscripten exports main as `__main_argc_argv` when it takes argc/argv. */
  private entry(argc: number, argv: number): number {
    return (this.exports.main ?? this.exports.__main_argc_argv)(argc, argv);
  }

  private refreshViews(): void {
    const buf = this.exports.memory.buffer;
    if (this.mem?.buffer !== buf) {
      this.mem = new Uint8Array(buf);
      this.dv = new DataView(buf);
    }
  }

  private grow(bytes: number): void {
    const need = Math.ceil((bytes - this.exports.memory.buffer.byteLength) / 65536);
    if (need > 0) this.exports.memory.grow(need);
    this.refreshViews();
  }

  private writeArgv(args: string[]): number {
    const enc = new TextEncoder();
    const strs = args.map((a) => enc.encode(`${a}\0`));
    const total = (args.length + 1) * 4 + strs.reduce((n, s) => n + s.length, 0);
    const base = this.exports._emscripten_stack_alloc((total + 15) & ~15);
    let sp = base + (args.length + 1) * 4;
    strs.forEach((s, i) => {
      this.mem.set(s, sp);
      this.dv.setUint32(base + i * 4, sp, true);
      sp += s.length;
    });
    this.dv.setUint32(base + args.length * 4, 0, true);
    return base;
  }

  // --- imports ------------------------------------------------------------

  /** After `spacing` ms of engine time, or after 30 lines of main.tex at least 50 ms apart, so a short body still gets checkpoints. */
  private dueForCheckpoint(f: Fd): boolean {
    if (this.mode === 'full' || !this.formatLoaded) return false;
    if (f.path === `${CWD}/main.tex`) this.linesSinceCheckpoint++;
    const since = performance.now() - this.lastCheckpointAt;
    if (since < 50) return false;
    return since >= this.spacing || this.linesSinceCheckpoint >= 30;
  }

  private importFor(module: string, name: string): (...a: any[]) => unknown {
    if (name.startsWith('invoke_')) return this.invoke.bind(this);
    const own = (this as unknown as Record<string, unknown>)[`imp_${name}`];
    if (typeof own === 'function') return own.bind(this) as (...a: any[]) => unknown;
    return () => {
      this.unknownImports.add(`${module}.${name}`);
      return -E.NOSYS;
    };
  }

  private invoke(index: number, ...args: unknown[]): unknown {
    const sp = this.exports.emscripten_stack_get_current();
    try {
      return (this.exports.__indirect_function_table as WebAssembly.Table).get(index)(...args);
    } catch (e) {
      this.exports._emscripten_stack_restore(sp);
      if (e !== LONGJMP) throw e;
      this.exports.setThrew(1, 0);
      return 0;
    }
  }

  private str(ptr: number): string {
    let end = ptr;
    while (this.mem[end] !== 0) end++;
    return new TextDecoder().decode(this.mem.subarray(ptr, end));
  }

  private resolve(dirfd: number, p: string): string {
    if (p.startsWith('/')) return normalize(p);
    if (dirfd !== AT_FDCWD) {
      const d = this.fds.get(dirfd);
      if (d) return normalize(`${d.path}/${p}`);
    }
    return normalize(`${CWD}/${p}`);
  }

  /** Inputs are the editable files under /work; outputs shadow them once written in this run. */
  /** A tree hit carries only its size; `open` unpacks it (kpathsea stats far more files than it reads). */
  private lookup(path: string): { kind: Fd['kind']; data: Uint8Array | null; out: OutFile | null; size: number } | null {
    const out = this.outputs.get(path);
    if (out) return { kind: 'output', data: null, out, size: out.len };
    if (path.startsWith(`${CWD}/`)) {
      const data = this.inputs.get(path.slice(CWD.length + 1)) ?? null;
      this.trace.push({ kind: 'lookup', path: path.slice(CWD.length + 1), existed: !!data });
      return data ? { kind: 'input', data, out: null, size: data.length } : null;
    }
    if (path === CWD || path === '/icu' || path === BIN_DIR || BIN_DIR.startsWith(`${path}/`) || path === EXAMANCE_CNF_DIR || this.tree.isDir(path)) return { kind: 'dir', data: null, out: null, size: 0 };
    if (path === this.icuPath) return { kind: 'tree', data: this.opts.icuData, out: null, size: this.opts.icuData.length };
    // kpathsea locates the tree from argv[0]'s directory; the binary itself is only stat-ed.
    if (path.startsWith(`${BIN_DIR}/`)) return { kind: 'tree', data: EMPTY, out: null, size: 0 };
    const size = this.tree.size(path);
    return size >= 0 ? { kind: 'tree', data: this.tree.cached(path), out: null, size } : null;
  }

  imp___syscall_openat(dirfd: number, pathPtr: number, flags: number): number {
    const path = this.resolve(dirfd, this.str(pathPtr));
    if ((flags & O_ACCMODE) !== 0) return this.openForWrite(path, flags);
    const hit = this.lookup(path);
    if (!hit) return -E.NOENT;
    if (path.endsWith('.fmt')) this.formatLoaded = true;
    const fd = this.nextFd++;
    this.fds.set(fd, { path, kind: hit.kind, data: hit.data, out: hit.out, pos: 0, size: hit.size });
    return fd;
  }

  /** Engine writes stay under /work; an input of the same name (main.aux) is only shadowed for the rest of this run. */
  private openForWrite(path: string, flags: number): number {
    if (!path.startsWith(`${CWD}/`)) return -E.ACCES;
    const truncate = (flags & O_TRUNC) !== 0;
    let out = this.outputs.get(path);
    if (!out || truncate) {
      const seed = out || truncate ? undefined : this.inputs.get(path.slice(CWD.length + 1));
      out = { data: seed ? seed.slice() : new Uint8Array(4096), len: seed?.length ?? 0, frozen: 0 };
      this.outputs.set(path, out);
    }
    const fd = this.nextFd++;
    this.fds.set(fd, { path, kind: 'output', data: null, out, pos: flags & O_APPEND ? out.len : 0, size: 0 });
    return fd;
  }

  imp_fd_read(fd: number, iovs: number, iovcnt: number, pnread: number): number {
    const f = this.fds.get(fd);
    if (this.rewinding) {
      this.exports.asyncify_stop_rewind();
      this.rewinding = false;
    } else if (f?.kind === 'tree' && !f.data) {
      this.pendingFetch = f;
      this.exports.asyncify_start_unwind(this.asyncData);
      return 0;
    } else if (f?.kind === 'input' && this.dueForCheckpoint(f)) {
      this.exports.asyncify_start_unwind(this.asyncData);
      return 0;
    }
    if (fd === 0) {
      this.dv.setUint32(pnread, 0, true);
      return 0;
    }
    if (!f) return E.BADF;
    const src = f.kind === 'output' ? f.out!.data.subarray(0, f.out!.len) : f.data;
    if (!src) return E.ISDIR;
    const start = f.pos;
    // Inputs are served one line per read (a short read, which stdio accepts): each line is then its own checkpoint point and trace entry.
    const limit = f.kind === 'input' ? lineEnd(src, f.pos) : src.length;
    let total = 0;
    let wanted = 0;
    for (let i = 0; i < iovcnt; i++) {
      const buf = this.dv.getUint32(iovs + i * 8, true);
      const len = this.dv.getUint32(iovs + i * 8 + 4, true);
      wanted += len;
      const n = Math.max(0, Math.min(len, limit - f.pos));
      this.mem.set(src.subarray(f.pos, f.pos + n), buf);
      f.pos += n;
      total += n;
      if (n < len) break;
    }
    if (f.kind === 'input') {
      this.trace.push({ kind: 'read', path: f.path.slice(CWD.length + 1), data: src, start, end: f.pos, eof: total < wanted && f.pos >= src.length });
    }
    this.dv.setUint32(pnread, total, true);
    return 0;
  }

  imp_fd_write(fd: number, iovs: number, iovcnt: number, pnwritten: number): number {
    let total = 0;
    const f = this.fds.get(fd);
    for (let i = 0; i < iovcnt; i++) {
      const buf = this.dv.getUint32(iovs + i * 8, true);
      const len = this.dv.getUint32(iovs + i * 8 + 4, true);
      const bytes = this.mem.subarray(buf, buf + len);
      if (fd === 1 || fd === 2) this.stdout.push(new TextDecoder().decode(bytes));
      else if (f?.out) writeOut(f, bytes);
      else return E.BADF;
      total += len;
    }
    this.dv.setUint32(pnwritten, total, true);
    return 0;
  }

  imp_fd_seek(fd: number, offset: bigint, whence: number, pnew: number): number {
    const f = this.fds.get(fd);
    if (!f) return E.BADF;
    const size = f.out ? f.out.len : (f.data?.length ?? f.size);
    const o = Number(offset);
    // WASI whence: 0 = SET, 1 = CUR, 2 = END.
    const origin = [0, f.pos, size][whence] ?? 0;
    const pos = origin + o;
    if (pos < 0) return E.INVAL;
    f.pos = pos;
    this.dv.setBigUint64(pnew, BigInt(pos), true);
    return 0;
  }

  imp_fd_close(fd: number): number {
    return this.fds.delete(fd) ? 0 : E.BADF;
  }

  imp_fd_sync(): number {
    return 0;
  }

  imp___syscall_fstat64(fd: number, buf: number): number {
    const f = this.fds.get(fd);
    if (!f) return -E.BADF;
    this.writeStat(buf, f.kind === 'dir', f.out ? f.out.len : (f.data?.length ?? f.size));
    return 0;
  }

  private statPath(path: string, buf: number): number {
    const hit = this.lookup(path);
    if (!hit) return -E.NOENT;
    this.writeStat(buf, hit.kind === 'dir', hit.size);
    return 0;
  }

  imp___syscall_stat64(pathPtr: number, buf: number): number {
    return this.statPath(this.resolve(AT_FDCWD, this.str(pathPtr)), buf);
  }

  imp___syscall_lstat64(pathPtr: number, buf: number): number {
    return this.imp___syscall_stat64(pathPtr, buf);
  }

  imp___syscall_newfstatat(dirfd: number, pathPtr: number, buf: number): number {
    return this.statPath(this.resolve(dirfd, this.str(pathPtr)), buf);
  }

  imp___syscall_faccessat(dirfd: number, pathPtr: number): number {
    return this.lookup(this.resolve(dirfd, this.str(pathPtr))) ? 0 : -E.NOENT;
  }

  private writeStat(p: number, dir: boolean, size: number): void {
    this.mem.fill(0, p, p + 96);
    this.dv.setUint32(p + 4, dir ? S_IFDIR | 0o755 : S_IFREG | 0o644, true);
    this.dv.setUint32(p + 8, 1, true);
    this.dv.setBigUint64(p + 24, BigInt(size), true);
    this.dv.setUint32(p + 32, 4096, true);
    this.dv.setUint32(p + 36, Math.ceil(size / 512), true);
    for (const off of [40, 56, 72]) this.dv.setBigUint64(p + off, BigInt(EPOCH), true);
  }

  imp___syscall_getcwd(buf: number, size: number): number {
    const bytes = new TextEncoder().encode(`${CWD}\0`);
    if (bytes.length > size) return -E.INVAL;
    this.mem.set(bytes, buf);
    return bytes.length;
  }

  imp___syscall_ioctl(): number {
    return -E.NOTTY;
  }
  imp___syscall_fcntl64(): number {
    return 0;
  }
  imp___syscall_readlinkat(): number {
    return -E.INVAL;
  }
  imp___syscall_getdents64(): number {
    return 0;
  }
  imp___syscall_unlinkat(dirfd: number, pathPtr: number): number {
    this.outputs.delete(this.resolve(dirfd, this.str(pathPtr)));
    return 0;
  }
  imp___syscall_renameat(od: number, op: number, nd: number, np: number): number {
    const from = this.resolve(od, this.str(op));
    const f = this.outputs.get(from);
    if (!f) return -E.NOENT;
    this.outputs.delete(from);
    this.outputs.set(this.resolve(nd, this.str(np)), f);
    return 0;
  }

  /** Allocates in the engine's heap and copies the file region (ICU data, fonts), like wasm_host.c. */
  imp__mmap_js(len: number, _prot: number, _flags: number, fd: number, offset: bigint, allocated: number, addr: number): number {
    const f = this.fds.get(fd);
    const src = f?.out ? f.out.data.subarray(0, f.out.len) : f?.data;
    // A tree file not fetched yet cannot be mapped synchronously; FreeType then falls back to reading it.
    if (!src) return f ? -E.NOSYS : -E.BADF;
    const memalign = this.exports.emscripten_builtin_memalign;
    const ptr = memalign ? memalign(65536, len) : this.exports.malloc(len);
    if (!ptr) return -48;
    this.refreshViews();
    const o = Number(offset);
    const n = Math.max(0, Math.min(len, src.length - o));
    this.mem.set(src.subarray(o, o + n), ptr);
    this.mem.fill(0, ptr + n, ptr + len);
    this.dv.setUint32(addr, ptr, true);
    this.dv.setUint32(allocated, 1, true);
    return 0;
  }
  imp__munmap_js(): number {
    return 0;
  }

  imp_environ_sizes_get(pcount: number, psize: number): number {
    const env = this.environ();
    this.dv.setUint32(pcount, env.length, true);
    this.dv.setUint32(psize, env.reduce((n, s) => n + new TextEncoder().encode(s).length + 1, 0), true);
    return 0;
  }
  imp_environ_get(penv: number, pbuf: number): number {
    let at = pbuf;
    this.environ().forEach((s, i) => {
      const b = new TextEncoder().encode(`${s}\0`);
      this.mem.set(b, at);
      this.dv.setUint32(penv + i * 4, at, true);
      at += b.length;
    });
    return 0;
  }
  private environ(): string[] {
    return [
      // The trailing ":" appends the distribution's defaults after ours, exactly as services/texrunner.py does.
      `TEXMFCNF=${EXAMANCE_CNF_DIR}:`,
      'ICU_DATA=/icu',
      `SOURCE_DATE_EPOCH=${EPOCH}`,
      'FORCE_SOURCE_DATE=1',
      'HOME=/work',
    ];
  }

  imp_clock_time_get(_id: number, _precision: bigint, ptime: number): number {
    this.dv.setBigUint64(ptime, BigInt(EPOCH) * 1_000_000_000n, true);
    return 0;
  }
  imp_emscripten_date_now(): number {
    return EPOCH * 1000;
  }
  imp_emscripten_get_now(): number {
    return 0;
  }
  imp__tzset_js(): void {
    // The clock is fixed (SOURCE_DATE_EPOCH) and UTC, so there is no time zone to set.
  }
  imp__localtime_js(t: bigint, ptm: number): void {
    this.writeTm(Number(t), ptm);
  }
  imp__gmtime_js(t: bigint, ptm: number): void {
    this.writeTm(Number(t), ptm);
  }
  imp__mktime_js(ptm: number): bigint {
    const g = (i: number) => this.dv.getInt32(ptm + i * 4, true);
    const t = Date.UTC(1900 + g(5), g(4), g(3), g(2), g(1), g(0)) / 1000;
    this.writeTm(t, ptm);
    return BigInt(t);
  }
  private writeTm(t: number, p: number): void {
    const d = new Date(t * 1000);
    const yday = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000);
    [d.getUTCSeconds(), d.getUTCMinutes(), d.getUTCHours(), d.getUTCDate(), d.getUTCMonth(), d.getUTCFullYear() - 1900, d.getUTCDay(), yday, 0].forEach((v, i) =>
      this.dv.setInt32(p + i * 4, v, true)
    );
    this.dv.setInt32(p + 36, 0, true);
    this.dv.setUint32(p + 40, 0, true);
  }
  imp_random_get(buf: number, len: number): number {
    for (let i = 0; i < len; i++) this.mem[buf + i] = (i * 131 + 7) & 0xff;
    return 0;
  }

  imp_emscripten_resize_heap(requested: number): number {
    try {
      this.grow(requested);
      return 1;
    } catch {
      return 0;
    }
  }
  imp_emscripten_get_heap_max(): number {
    return 2 ** 31;
  }
  imp__emscripten_throw_longjmp(): never {
    throw LONGJMP;
  }
  imp_exit(code: number): never {
    throw new ExitSignal(code);
  }
  imp_proc_exit(code: number): never {
    throw new ExitSignal(code);
  }
  imp__abort_js(): never {
    throw new Error('engine abort()');
  }
  imp___cxa_throw(): never {
    throw new Error('engine C++ exception (exceptions are disabled in this build)');
  }
  imp___assert_fail(cond: number, file: number, line: number): never {
    throw new Error(`engine assert: ${this.str(cond)} (${this.str(file)}:${line})`);
  }
  imp_emscripten_system(): number {
    return -1;
  }
  imp__emscripten_runtime_keepalive_clear(): void {
    // The host drives the module itself; there is no runtime keepalive to clear.
  }
}

/** SIMD page hasher importing the engine's memory (source: pageHash.wat); about 5x faster than hashing in JS. */
const PAGE_HASH_WASM = 'AGFzbQEAAAABBgFgAX8BfwIPAQNlbnYGbWVtb3J5AgAAAwIBAAcIAQRoYXNoAAAK6AEB5QECAn8FeyAAQQx0IQEgAUGAIGohAv0MkwEAAZMBAAGTAQABkwEAASEH/QzFnRyBxZ0cgcWdHIHFnRyBIQMgAyEEIAMhBSADIQYDQCADIAH9AAQA/VEgB/21ASEDIAQgAf0ABBD9USAH/bUBIQQgBSAB/QAEIP1RIAf9tQEhBSAGIAH9AAQw/VEgB/21ASEGIAFBwABqIgEgAkkNAAsgAyAE/VEgB/21ASAF/VEgB/21ASAG/VEgB/21ASEDIAP9GwAgA/0bAXNBk4OACGwgA/0bAnNBk4OACGwgA/0bA3NBk4OACGwL';
let pageHashModule: WebAssembly.Module | null = null;
let zeroPageHash = 0;

function pageHasher(memory: WebAssembly.Memory): (page: number) => number {
  if (!pageHashModule) {
    pageHashModule = new WebAssembly.Module(Uint8Array.from(atob(PAGE_HASH_WASM), (c) => c.codePointAt(0) ?? 0));
    const probe = new WebAssembly.Instance(pageHashModule, { env: { memory: new WebAssembly.Memory({ initial: 1 }) } });
    zeroPageHash = (probe.exports.hash as (p: number) => number)(0);
  }
  const inst = new WebAssembly.Instance(pageHashModule, { env: { memory } });
  return inst.exports.hash as (page: number) => number;
}

/** Scratch for encodeXor: a page's worst case is one run of all words plus its two header words. */
const XOR_SCRATCH = new Uint32Array((PAGE >> 2) + 2);
const XOR_WORDS = new Int32Array(PAGE >> 2);
const ZERO_WORDS = new Int32Array(PAGE >> 2);

/** A page's XOR against `prev` (zero when null) as runs: [start, length, words…]…, word offsets within the page. */
function encodeXor(words: Int32Array, o: number, prev: Int32Array | null): Uint32Array {
  const base = prev ?? ZERO_WORDS;
  for (let i = 0; i < XOR_WORDS.length; i++) XOR_WORDS[i] = words[o + i] ^ base[i];
  return encodeRuns(XOR_WORDS);
}

function encodeRuns(x: Int32Array): Uint32Array {
  const n = x.length;
  let w = 0;
  for (let i = 0; i < n; ) {
    if (x[i] === 0) {
      i++;
      continue;
    }
    let end = i;
    while (end < n && x[end] !== 0) end++;
    // Scattered changes would need more header words than the page has: then the whole page goes as one run.
    if (w + 2 + (end - i) > XOR_SCRATCH.length) return fullRun(x);
    XOR_SCRATCH[w++] = i;
    XOR_SCRATCH[w++] = end - i;
    for (; i < end; i++) XOR_SCRATCH[w++] = x[i];
  }
  return XOR_SCRATCH.slice(0, w);
}

function fullRun(x: Int32Array): Uint32Array {
  const out = new Uint32Array(x.length + 2);
  out[1] = x.length;
  out.set(x, 2);
  return out;
}

function applyXor(words: Int32Array, o: number, delta: Uint32Array): void {
  for (let k = 0; k < delta.length; ) {
    const start = delta[k];
    const len = delta[k + 1];
    for (let i = 0; i < len; i++) words[o + start + i] ^= delta[k + 2 + i];
    k += 2 + len;
  }
}

/** The single delta that applying `a` then `b` amounts to. */
function combineXor(a: Uint32Array, b: Uint32Array): Uint32Array {
  const page = new Int32Array(PAGE >> 2);
  applyXor(page, 0, a);
  applyXor(page, 0, b);
  return encodeXor(page, 0, null);
}

function writeOut(f: Fd, bytes: Uint8Array): void {
  const out = f.out!;
  if (f.pos < out.frozen) {
    // A checkpoint still points at these bytes: write into a copy (f.out stays the same record, so other fds see it).
    out.data = out.data.slice();
    out.frozen = 0;
  }
  const end = f.pos + bytes.length;
  if (end > out.data.length) {
    const grown = new Uint8Array(Math.max(end, out.data.length * 2));
    grown.set(out.data.subarray(0, out.len));
    out.data = grown;
  }
  out.data.set(bytes, f.pos);
  f.pos = end;
  out.len = Math.max(out.len, end);
}

/** Copies fds and output records together, so a copied fd points at the copied record of its file. */
function cloneState(fds: Map<number, Fd>, outputs: Map<string, OutFile>): { fds: Map<number, Fd>; outputs: Map<string, OutFile> } {
  const remap = new Map<OutFile, OutFile>();
  const copyOut = (f: OutFile) => remap.get(f) ?? remap.set(f, { ...f }).get(f)!;
  const outs = new Map([...outputs].map(([k, f]) => [k, copyOut(f)]));
  return { fds: new Map([...fds].map(([k, f]) => [k, { ...f, out: f.out ? copyOut(f.out) : null }])), outputs: outs };
}

/** End of the line starting at `pos` (after its newline), or the end of the file. */
function lineEnd(src: Uint8Array, pos: number): number {
  const nl = src.indexOf(10, pos);
  return nl < 0 ? src.length : nl + 1;
}


function normalize(p: string): string {
  const out: string[] = [];
  for (const part of p.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return `/${out.join('/')}`;
}
