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
//
// This fetches the *raw* archive. build.mjs first tries the already processed
// copy (see busytex-mirror.mjs) and only falls back to this script.
import fs from 'node:fs';
import path from 'node:path';
import { RAW_ARCHIVE, UPSTREAM_URL, mirrorUrl, run, streamExtract, version } from './busytex-mirror.mjs';

const dest = path.resolve(process.argv[2] || 'static/core');
const busytexDir = path.join(dest, 'busytex');

async function main() {
  if (fs.existsSync(busytexDir) && fs.readdirSync(busytexDir).length > 0) {
    console.log('✓ BusyTeX assets already exist');
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const url of [mirrorUrl(RAW_ARCHIVE), UPSTREAM_URL].filter(Boolean)) {
    console.log(`Streaming BusyTeX assets v${version} from ${url}`);
    const started = Date.now();
    try {
      await streamExtract(url, dest, { gzip: true, expect: 'busytex' });
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
