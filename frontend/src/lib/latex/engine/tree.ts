/** The server's pinned TeX Live tree as the engine sees it (issue #346): sizes from the manifest, bytes fetched on first read and kept in IndexedDB. */

/** Where the engine mounts the tree: the server's own prefix, so kpathsea derives the same variables from the same texmf.cnf. */
export const TREE_ROOT = '/opt/texlive';

export interface TreeManifest {
  /** Changes with any served file of the server image. */
  version: string;
  files: Record<string, number>;
}

/** How the worker reaches the files: through the main thread, which owns the authenticated API client. */
export interface TreeSource {
  manifest(): Promise<TreeManifest>;
  file(relativePath: string, version: string): Promise<Uint8Array>;
}

/** What the engine host needs; `cached` must answer synchronously, `load` may wait on the network. */
export interface Tree {
  size(path: string): number;
  isDir(path: string): boolean;
  cached(path: string): Uint8Array | null;
  load(path: string): Promise<Uint8Array>;
  /** Files the engine writes into the tree, such as a dumped format. */
  add(path: string, bytes: Uint8Array): void;
}

const DB_NAME = 'examance-texlive';
const STORE = 'files';
const VERSION_KEY = '#version';
const PREFETCH_PARALLEL = 12;

/** An IndexedDB request as a promise (the engine's two caches: TeX Live files here, formats in the worker). */
export function idb<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

/** Public TeX Live bytes only (never workspace data), so this store is not part of the encrypted vault. */
async function openCache(version: string): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    });
    const stored = await idb(db.transaction(STORE).objectStore(STORE).get(VERSION_KEY));
    if (stored !== version) {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.objectStore(STORE).put(version, VERSION_KEY);
      await new Promise((r) => (tx.oncomplete = r));
    }
    return db;
  } catch {
    return null;
  }
}

export class LazyTree implements Tree {
  private readonly bytes = new Map<string, Uint8Array>();
  private readonly loading = new Map<string, Promise<Uint8Array>>();
  private readonly extra = new Map<string, Uint8Array>();
  /** The root and its ancestors count too: kpathsea lstat()s every component of argv[0]. */
  private readonly dirs = new Set<string>(TREE_ROOT.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/') || '/'));
  /** Bytes fetched from the network in this worker, for the timing line and tests. */
  fetchedBytes = 0;

  private readonly manifest: TreeManifest;
  private readonly source: TreeSource;
  private readonly db: IDBDatabase | null;

  private constructor(manifest: TreeManifest, source: TreeSource, db: IDBDatabase | null) {
    this.manifest = manifest;
    this.source = source;
    this.db = db;
    for (const path of Object.keys(manifest.files)) {
      for (let i = path.lastIndexOf('/'); i > 0; i = path.lastIndexOf('/', i - 1)) {
        const dir = `${TREE_ROOT}/${path.slice(0, i)}`;
        if (this.dirs.has(dir)) break;
        this.dirs.add(dir);
      }
    }
  }

  static async open(source: TreeSource, cache = true): Promise<LazyTree> {
    const manifest = await source.manifest();
    return new LazyTree(manifest, source, cache ? await openCache(manifest.version) : null);
  }

  get version(): string {
    return this.manifest.version;
  }

  private rel(path: string): string | null {
    return path.startsWith(`${TREE_ROOT}/`) ? path.slice(TREE_ROOT.length + 1) : null;
  }

  size(path: string): number {
    const added = this.extra.get(path);
    if (added) return added.length;
    const rel = this.rel(path);
    return rel === null ? -1 : (this.manifest.files[rel] ?? -1);
  }

  isDir(path: string): boolean {
    return this.dirs.has(path);
  }

  cached(path: string): Uint8Array | null {
    return this.extra.get(path) ?? this.bytes.get(path) ?? null;
  }

  add(path: string, bytes: Uint8Array): void {
    this.extra.set(path, bytes);
    for (let i = path.lastIndexOf('/'); i > 0; i = path.lastIndexOf('/', i - 1)) this.dirs.add(path.slice(0, i));
  }

  load(path: string): Promise<Uint8Array> {
    const hit = this.cached(path);
    if (hit) return Promise.resolve(hit);
    let pending = this.loading.get(path);
    if (!pending) {
      pending = this.fetchOne(path).finally(() => this.loading.delete(path));
      this.loading.set(path, pending);
    }
    return pending;
  }

  /** Loads `paths` ahead of the engine, a few at a time; a failure only costs the head start. */
  async prefetch(paths: string[]): Promise<void> {
    const queue = paths.filter((p) => this.size(p) >= 0 && !this.cached(p));
    const worker = async () => {
      for (let p = queue.shift(); p !== undefined; p = queue.shift()) await this.load(p).catch(() => undefined); // NOSONAR: each of the parallel workers takes one file at a time
    };
    await Promise.all(Array.from({ length: PREFETCH_PARALLEL }, worker));
  }

  private async fetchOne(path: string): Promise<Uint8Array> {
    const rel = this.rel(path);
    if (rel === null || this.manifest.files[rel] === undefined) throw new Error(`Not in the TeX Live tree: ${path}`);
    const key = `${this.manifest.version}/${rel}`;
    let bytes = this.db ? ((await idb(this.db.transaction(STORE).objectStore(STORE).get(key)).catch(() => undefined)) as Uint8Array | undefined) : undefined;
    if (!bytes) {
      bytes = await this.source.file(rel, this.manifest.version);
      this.fetchedBytes += bytes.length;
      if (this.db) this.db.transaction(STORE, 'readwrite').objectStore(STORE).put(bytes, key);
    }
    this.bytes.set(path, bytes);
    return bytes;
  }
}
