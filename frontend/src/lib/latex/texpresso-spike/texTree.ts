/** Read-only TeX Live tree for the TeXpresso spike, built from busytex's own data packages (same origin, same bytes as the busytex engine). */

export const BUSYTEX_BASE = '/core/busytex';
export const TREE_PACKAGES = ['texlive-basic', 'texlive-recommended', 'texlive-extra'];

const EM_CACHE_DB = 'EM_PRELOAD_CACHE';
/** file_packager --lz4 compresses in blocks of this many decompressed bytes (emscripten's MiniLZ4.CHUNK_SIZE). */
const LZ4_CHUNK = 2048;

/** A package's `.data` with its LZ4 block table; files are unpacked on first read only, the whole tree would exceed 1 GB. */
export interface Lz4Package {
  data: Uint8Array;
  offsets: number[];
  sizes: number[];
  successes: number[];
}

interface Entry {
  pkg: Lz4Package;
  start: number;
  end: number;
}

export class TexTree {
  private readonly entries = new Map<string, Entry | Uint8Array>();
  readonly dirs = new Set<string>(['/']);
  /** Where each package came from, for the report: busytex's IndexedDB cache or the network. */
  readonly sources: Record<string, 'cache' | 'network'> = {};
  /** Compressed bytes held, and bytes unpacked so far. */
  bytes = 0;
  unpacked = 0;

  /** Later calls override earlier ones, as when busytex mounts the packages in order. */
  add(path: string, bytes: Uint8Array | Entry): void {
    this.entries.set(path, bytes);
    for (let i = path.lastIndexOf('/'); i > 0; i = path.lastIndexOf('/', i - 1)) {
      const dir = path.slice(0, i);
      if (this.dirs.has(dir)) break;
      this.dirs.add(dir);
    }
  }

  addPackage(pkg: Lz4Package, files: PackageMeta['files']): void {
    for (const f of files) this.add(f.filename, { pkg, start: f.start, end: f.end });
  }

  size(path: string): number {
    const e = this.entries.get(path);
    if (!e) return -1;
    return e instanceof Uint8Array ? e.length : e.end - e.start;
  }

  read(path: string): Uint8Array | null {
    const e = this.entries.get(path);
    if (!e || e instanceof Uint8Array) return e ?? null;
    const bytes = unpack(e);
    this.entries.set(path, bytes);
    this.unpacked += bytes.length;
    return bytes;
  }
}

function unpack({ pkg, start, end }: Entry): Uint8Array {
  const out = new Uint8Array(end - start);
  const block = new Uint8Array(LZ4_CHUNK);
  for (let c = Math.floor(start / LZ4_CHUNK); c * LZ4_CHUNK < end; c++) {
    const src = pkg.data.subarray(pkg.offsets[c], pkg.offsets[c] + pkg.sizes[c]);
    const plain = pkg.successes[c] ? block.subarray(0, lz4Block(src, block)) : src;
    const from = Math.max(start, c * LZ4_CHUNK);
    const to = Math.min(end, (c + 1) * LZ4_CHUNK);
    out.set(plain.subarray(from - c * LZ4_CHUNK, to - c * LZ4_CHUNK), from - start);
  }
  return out;
}

/** An LZ4 length: the 4-bit field, plus extension bytes while they read 255. */
function lz4Length(input: Uint8Array, at: number, nibble: number): [number, number] {
  let len = nibble;
  if (nibble !== 15) return [len, at];
  let b: number;
  do {
    b = input[at++];
    len += b;
  } while (b === 255);
  return [len, at];
}

/** LZ4 block decoding, as MiniLZ4.uncompress in emscripten's liblz4 (MIT, after node-lz4 by Pierre Curto). */
function lz4Block(input: Uint8Array, output: Uint8Array): number {
  let i = 0;
  let j = 0;
  while (i < input.length) {
    const token = input[i++];
    let lit: number;
    [lit, i] = lz4Length(input, i, token >> 4);
    output.set(input.subarray(i, i + lit), j);
    i += lit;
    j += lit;
    if (i >= input.length) return j;
    const offset = input[i] | (input[i + 1] << 8);
    i += 2;
    if (offset === 0 || offset > j) throw new Error('corrupt LZ4 block in a busytex package');
    let len: number;
    [len, i] = lz4Length(input, i, token & 0xf);
    for (let pos = j - offset, endAt = j + len + 4; j < endAt; ) output[j++] = output[pos++];
  }
  return j;
}

export interface PackageMeta {
  files: { filename: string; start: number; end: number }[];
}

/** The file list (`loadPackage({"files": …})`) and the LZ4 block table (`compressedData = {…}`) embedded in `<name>.js`. */
export function parsePackageScript(text: string): { files: PackageMeta['files']; table: Omit<Lz4Package, 'data'> } {
  const start = text.indexOf('{"files"');
  const cd = text.indexOf('compressedData = {');
  if (start < 0 || cd < 0) throw new Error('unexpected busytex package script (no file list or LZ4 table)');
  // Both objects end at the first "}" that follows their last key, since none of their values holds an object.
  const files = JSON.parse(text.slice(start, text.indexOf('}', text.indexOf('"remote_package_size"', start)) + 1)).files;
  const objStart = cd + 'compressedData = '.length;
  const table = JSON.parse(text.slice(objStart, text.indexOf('}', text.indexOf('"successes"', objStart)) + 1));
  return { files, table: { offsets: table.offsets, sizes: table.sizes, successes: table.successes } };
}

async function fetchMeta(name: string) {
  return parsePackageScript(await (await fetch(`${BUSYTEX_BASE}/${name}.js`)).text());
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** The package bytes from emscripten's preload cache (written by busytex), or null; never creates or upgrades the database. */
async function readCachedPackage(name: string): Promise<Uint8Array | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await new Promise<IDBDatabase | null>((resolve) => {
    const req = indexedDB.open(EM_CACHE_DB);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onupgradeneeded = () => {
      req.transaction?.abort();
      resolve(null);
    };
  });
  if (!db) return null;
  try {
    if (!db.objectStoreNames.contains('METADATA') || !db.objectStoreNames.contains('PACKAGES')) return null;
    const keys = await idbRequest(db.transaction('METADATA').objectStore('METADATA').getAllKeys());
    const key = keys.find((k) => String(k).endsWith(`/${name}.data`));
    if (key === undefined) {
      console.info(`[texpresso-spike] ${name}: not in busytex's cache`);
      return null;
    }
    const meta = (await idbRequest(db.transaction('METADATA').objectStore('METADATA').get(key))) as { chunkCount: number };
    // Keys are "metadata/<worker path>/<package>" and "package/<worker path>/<package>/<n>": every busytex worker location keeps its own copy.
    const cacheName = String(key).replace(/^metadata\//, '');
    const store = db.transaction('PACKAGES').objectStore('PACKAGES');
    const chunks = await Promise.all(
      Array.from({ length: meta.chunkCount }, (_, i) => idbRequest(store.get(`package/${cacheName}/${i}`)) as Promise<ArrayBuffer>)
    );
    if (chunks.some((c) => !c)) return null;
    return concat(chunks.map((c) => new Uint8Array(c)));
  } catch (err) {
    console.info(`[texpresso-spike] ${name}: busytex's cache unreadable`, err);
    return null;
  } finally {
    db.close();
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

/** The package from our origin; `../fetchInterceptor` (imported by the worker) joins and gunzips the chunks of chunk-manifest.json. */
async function fetchPackage(name: string): Promise<Uint8Array> {
  const res = await fetch(`${BUSYTEX_BASE}/${name}.data`);
  if (!res.ok) throw new Error(`${name}.data: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function loadTexTree(): Promise<TexTree> {
  const tree = new TexTree();
  for (const name of TREE_PACKAGES) {
    const [meta, cached] = await Promise.all([fetchMeta(name), readCachedPackage(name)]);
    const data = cached ?? (await fetchPackage(name));
    tree.sources[name] = cached ? 'cache' : 'network';
    tree.bytes += data.byteLength;
    tree.addPackage({ data, ...meta.table }, meta.files);
  }
  return tree;
}
