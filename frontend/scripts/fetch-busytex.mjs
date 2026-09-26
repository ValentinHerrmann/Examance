// Downloads the BusyTeX WASM/TeX Live assets into <dest>/busytex.
//
// Replaces `npx texlyre-busytex download-assets` on the hot path of every
// Cloudflare Pages build. The upstream script downloads the ~500 MB archive to
// disk, then extracts it, and its process lingers for ~15 s afterwards on an
// idle keep-alive socket. Here the download is streamed straight into the
// system `tar`, so extraction overlaps the transfer, and the process exits as
// soon as the work is done. Any failure falls back to the upstream script.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';

const require = createRequire(import.meta.url);
const { version } = require('texlyre-busytex/package.json');
const URL = `https://github.com/TeXlyre/texlyre-busytex/releases/download/assets-v${version}/busytex-assets.tar.gz`;

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

async function streamExtract() {
  // Extract into a scratch directory and move into place only on success, so
  // an interrupted build never leaves a partial tree that the next run skips.
  const tmp = path.join(dest, '.busytex-download');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  try {
    const res = await fetch(URL);
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
  console.log(`Streaming BusyTeX assets v${version} from ${URL}`);
  const started = Date.now();
  try {
    await streamExtract();
    console.log(`✓ BusyTeX assets ready (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  } catch (err) {
    console.warn(`Streaming download failed (${err.message}); falling back to texlyre-busytex download-assets`);
    await run('npx', ['texlyre-busytex', 'download-assets', dest]);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
