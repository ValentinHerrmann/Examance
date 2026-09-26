// Shared naming and download helpers for the BusyTeX assets, used by
// fetch-busytex.mjs, build.mjs and .github/workflows/mirror-busytex.yml
// (`node scripts/busytex-mirror.mjs keys`), so all three agree on what the R2
// mirror holds:
//
//   busytex-assets-v<version>.tar.gz
//     The upstream release archive, byte for byte.
//   busytex-processed-v<version>-<hash>.tar
//     The result of process-large-files.mjs on that archive: gzipped 20 MB
//     chunks, chunk-manifest.json and the fetch interceptor — exactly what
//     ends up under build/core/busytex. <hash> covers the scripts that produce
//     it, so changing either one yields a new object instead of stale output.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.dirname(SCRIPTS);

// From the lockfile rather than node_modules, so the mirror workflow can
// compute the same names without installing dependencies.
const lock = JSON.parse(fs.readFileSync(path.join(FRONTEND, 'package-lock.json'), 'utf-8'));
export const version = lock.packages?.['node_modules/texlyre-busytex']?.version;
if (!version) throw new Error('texlyre-busytex not found in package-lock.json');

const processingHash = createHash('sha256')
  .update(fs.readFileSync(path.join(SCRIPTS, 'process-large-files.mjs')))
  .update(fs.readFileSync(path.join(SCRIPTS, 'fetch-interceptor.js')))
  .digest('hex')
  .slice(0, 12);

export const RAW_ARCHIVE = `busytex-assets-v${version}.tar.gz`;
export const PROCESSED_ARCHIVE = `busytex-processed-v${version}-${processingHash}.tar`;
export const UPSTREAM_URL = `https://github.com/TeXlyre/texlyre-busytex/releases/download/assets-v${version}/busytex-assets.tar.gz`;

/** URL of `name` in the R2 mirror, or null when BUSYTEX_MIRROR_URL is unset. */
export function mirrorUrl(name) {
  const base = process.env.BUSYTEX_MIRROR_URL?.replace(/\/+$/, '');
  return base ? `${base}/${name}` : null;
}

export function run(cmd, args, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: [stdin ? 'pipe' : 'inherit', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
    if (stdin) {
      stdin.on('error', (err) => child.stdin.destroy(err));
      child.stdin.on('error', reject);
      stdin.pipe(child.stdin);
    }
  });
}

/**
 * Streams the tarball at `url` straight into the system `tar`, extracting into
 * `dest`. Extraction goes to a scratch directory first and is moved into place
 * only once `expect` (a path relative to `dest`) exists, so an interrupted or
 * wrong download never leaves a partial tree that a later run would skip.
 */
export async function streamExtract(url, dest, { gzip, expect }) {
  const tmp = path.join(dest, '.busytex-download');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  try {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
    await run('tar', [gzip ? '-xzf' : '-xf', '-', '-C', tmp], Readable.fromWeb(res.body));
    if (!fs.existsSync(path.join(tmp, expect))) throw new Error(`Archive did not contain ${expect}`);
    for (const entry of fs.readdirSync(tmp)) {
      fs.rmSync(path.join(dest, entry), { recursive: true, force: true });
      fs.renameSync(path.join(tmp, entry), path.join(dest, entry));
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === 'keys') {
  console.log(JSON.stringify({ version, raw: RAW_ARCHIVE, processed: PROCESSED_ARCHIVE, upstream: UPSTREAM_URL }));
}
