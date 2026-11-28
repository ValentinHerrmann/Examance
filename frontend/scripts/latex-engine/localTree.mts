// The server's TeX Live from a local install (TEXLIVE_ROOT, default /opt/texlive) with the endpoint's filters (backend/app/services/texlive_tree.py), and the bundled assets, for the engine scripts.
import fs from 'node:fs';
import path from 'node:path';
import type { TreeManifest, TreeSource } from '../../src/lib/latex/engine/tree';

export const TEXLIVE_ROOT = process.env.TEXLIVE_ROOT ?? '/opt/texlive';
const examanceCnf = path.resolve('../backend/latex-texlive/texmf.cnf');
const assetsDir = path.resolve('../backend/latex-assets');
const SKIPPED = ['texmf-dist/doc/', 'texmf-dist/source/', 'texmf-dist/scripts/'];

/** The manifest the endpoint would serve for the local tree. */
export function localManifest(): TreeManifest {
  const files: Record<string, number> = {};
  if (fs.existsSync(path.join(TEXLIVE_ROOT, 'texmf.cnf'))) files['texmf.cnf'] = fs.statSync(path.join(TEXLIVE_ROOT, 'texmf.cnf')).size;
  for (const top of ['texmf-dist', 'texmf-var']) {
    for (const rel of fs.readdirSync(path.join(TEXLIVE_ROOT, top), { recursive: true }) as string[]) {
      const name = `${top}/${rel}`;
      const st = fs.statSync(path.join(TEXLIVE_ROOT, name));
      if (st.isFile() && !SKIPPED.some((s) => name.startsWith(s))) files[name] = st.size;
    }
  }
  files['examance/texmf.cnf'] = fs.statSync(examanceCnf).size;
  return { version: 'local', files };
}

/** A tree file's bytes by its path relative to the root. */
export function localFile(rel: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(rel === 'examance/texmf.cnf' ? examanceCnf : path.join(TEXLIVE_ROOT, rel)));
}

export function localSource(): TreeSource {
  const manifest = localManifest();
  return { manifest: async () => manifest, file: async (rel) => localFile(rel) };
}

/** The bundled LaTeX assets as engine inputs (`sty/x.sty` also as `x.sty`, as the worker mounts them). */
export function assetInputs(): Map<string, Uint8Array> {
  const inputs = new Map<string, Uint8Array>();
  for (const rel of fs.readdirSync(assetsDir, { recursive: true }) as string[]) {
    const abs = path.join(assetsDir, rel);
    if (!fs.statSync(abs).isFile()) continue;
    const bytes = new Uint8Array(fs.readFileSync(abs));
    inputs.set(rel, bytes);
    if (rel.startsWith('sty/') && /\.(sty|tex)$/.test(rel)) inputs.set(rel.slice(4), bytes);
  }
  return inputs;
}

/** All asset files with their paths, as the worker's `assets` message carries them. */
export function assetFiles(): { path: string; content: Uint8Array }[] {
  return (fs.readdirSync(assetsDir, { recursive: true }) as string[])
    .filter((rel) => fs.statSync(path.join(assetsDir, rel)).isFile())
    .map((rel) => ({ path: rel, content: new Uint8Array(fs.readFileSync(path.join(assetsDir, rel))) }));
}
