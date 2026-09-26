// Downloads the BusyTeX WASM/TeX Live assets into <dest>/busytex.
//
// Replaces `npx texlyre-busytex download-assets` on the hot path of every
// Cloudflare Pages build. The upstream script downloads the ~500 MB archive to
// disk, then extracts it, and its process lingers for ~15 s afterwards on an
// idle keep-alive socket. Here the download is streamed straight into the
// system `tar`, so extraction overlaps the transfer, and the process exits as
// soon as the work is done.
//
// Sources, in order: the R2 mirror named by BUSYTEX_MIRROR_URL (a Cloudflare
// Pages environment variable; filled by .github/workflows/mirror-busytex.yml),
// because GitHub's release CDN ranged from 10 s to 52 s for the same archive on
// Pages builds; then the upstream GitHub release; then the upstream script.
// A missing or stale mirror therefore only costs speed, never the build.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';

const require = createRequire(import.meta.url);
const { version } = require('texlyre-busytex/package.json');
const ARCHIVE = `busytex-assets-v${version}.tar.gz`;
const UPSTREAM_URL = `https://github.com/TeXlyre/texlyre-busytex/releases/download/assets-v${version}/busytex-assets.tar.gz`;
const MIRROR_URL = process.env.BUSYTEX_MIRROR_URL
  ? `${process.env.BUSYTEX_MIRROR_URL.replace(/\/+$/, '')}/${ARCHIVE}`
  : null;

const dest = path.resolve(process.argv[2] || 'static/core');
const busytexDir = path.join(dest, 'busytex');

function run(cmd, args, stdin) {
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

async function streamExtract(url) {
  // Extract into a scratch directory and move into place only on success, so
  // an interrupted build never leaves a partial tree that the next run skips.
  const tmp = path.join(dest, '.busytex-download');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  try {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
    await run('tar', ['-xzf', '-', '-C', tmp], Readable.fromWeb(res.body));
    for (const entry of fs.readdirSync(tmp)) {
      fs.rmSync(path.join(dest, entry), { recursive: true, force: true });
      fs.renameSync(path.join(tmp, entry), path.join(dest, entry));
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (!fs.existsSync(busytexDir)) throw new Error(`Archive did not contain busytex/`);
}

async function main() {
  if (fs.existsSync(busytexDir) && fs.readdirSync(busytexDir).length > 0) {
    console.log('✓ BusyTeX assets already exist');
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const url of [MIRROR_URL, UPSTREAM_URL].filter(Boolean)) {
    console.log(`Streaming BusyTeX assets v${version} from ${url}`);
    const started = Date.now();
    try {
      await streamExtract(url);
      console.log(`✓ BusyTeX assets ready (${((Date.now() - started) / 1000).toFixed(1)} s)`);
      return;
    } catch (err) {
      console.warn(`Streaming download failed (${err.message})`);
    }
  }
  console.warn('Falling back to texlyre-busytex download-assets');
  await run('npx', ['texlyre-busytex', 'download-assets', dest]);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
