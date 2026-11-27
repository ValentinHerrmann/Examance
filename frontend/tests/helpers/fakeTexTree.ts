/** The browser engine's server side for the fake API (`fakeApi.ts`): the TeX Live tree (`/texlive/index.json`, `/texlive/<path>`) from a local install and the bundled assets (`/latex-assets/…`) from `backend/latex-assets`, mirroring `backend/app/services/texlive_tree.py` and `latex_assets.py`. Only the e2e specs that run the real engine use it; without a local tree it answers nothing and those specs skip. */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** The pinned TeX Live of the backend image (`backend/latex-texlive/`), installed locally. */
export const TEXLIVE_ROOT = process.env.TEXLIVE_ROOT ?? '/opt/texlive';
const FRONTEND = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const ASSETS = path.join(FRONTEND, '../backend/latex-assets');
const EXAMANCE_CNF = path.join(FRONTEND, '../backend/latex-texlive/texmf.cnf');
const SKIPPED = ['texmf-dist/doc/', 'texmf-dist/source/', 'texmf-dist/scripts/'];

export function hasLocalTexTree(): boolean {
  return fs.existsSync(path.join(TEXLIVE_ROOT, 'texmf-dist'));
}

let tree: { version: string; files: Record<string, number> } | null = null;

function treeIndex(): { version: string; files: Record<string, number> } {
  if (tree) return tree;
  const files: Record<string, number> = { 'examance/texmf.cnf': fs.statSync(EXAMANCE_CNF).size };
  if (fs.existsSync(path.join(TEXLIVE_ROOT, 'texmf.cnf'))) files['texmf.cnf'] = fs.statSync(path.join(TEXLIVE_ROOT, 'texmf.cnf')).size;
  for (const top of ['texmf-dist', 'texmf-var']) {
    for (const rel of fs.readdirSync(path.join(TEXLIVE_ROOT, top), { recursive: true }) as string[]) {
      const name = `${top}/${rel}`;
      const st = fs.statSync(path.join(TEXLIVE_ROOT, name));
      if (st.isFile() && !SKIPPED.some((s) => name.startsWith(s))) files[name] = st.size;
    }
  }
  tree = { version: 'local', files };
  return tree;
}

let assets: { path: string; sha256: string }[] | null = null;

function assetIndex(): { path: string; sha256: string }[] {
  assets ??= (fs.readdirSync(ASSETS, { recursive: true }) as string[])
    .filter((rel) => fs.statSync(path.join(ASSETS, rel)).isFile())
    .map((rel) => ({ path: rel.split(path.sep).join('/'), sha256: createHash('sha256').update(fs.readFileSync(path.join(ASSETS, rel))).digest('hex') }));
  return assets;
}

/** A file under `root` named by an untrusted request path, or null when it would leave `root`. */
function inside(root: string, rel: string): string | null {
  const full = path.resolve(root, rel);
  return full.startsWith(path.resolve(root) + path.sep) && fs.existsSync(full) && fs.statSync(full).isFile() ? full : null;
}

type Answer = { status: number; body?: unknown; bytes?: Uint8Array; headers?: Record<string, string> };

const file = (full: string): Answer => ({ status: 200, bytes: new Uint8Array(fs.readFileSync(full)), headers: { 'content-type': 'application/octet-stream' } });

function treeRoute(rest: string): Answer | undefined {
  if (rest === 'index.json') return { status: 200, body: treeIndex() };
  if (rest === 'examance/texmf.cnf') return file(EXAMANCE_CNF);
  const full = treeIndex().files[rest] === undefined ? null : inside(TEXLIVE_ROOT, rest);
  return full ? file(full) : undefined;
}

function assetRoute(rest: string): Answer | undefined {
  if (rest === 'index.json') return { status: 200, body: { files: assetIndex() } };
  const full = inside(ASSETS, rest);
  return full ? file(full) : undefined;
}

/** `/texlive/…` and `/latex-assets/…` (path parts after `/api/v1`), or undefined when there is no local tree or no such file. */
export function texTreeRoute(verb: string, parts: string[]): Answer | undefined {
  if (verb !== 'GET' || !hasLocalTexTree()) return undefined;
  const rest = decodeURIComponent(parts.slice(1).join('/'));
  if (parts[0] === 'texlive') return treeRoute(rest);
  if (parts[0] === 'latex-assets') return assetRoute(rest);
  return undefined;
}
