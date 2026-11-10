// Downloads the BusyTeX assets into <dest>/busytex, streaming into the system `tar` (upstream's script lingers ~15 s). Sources in order: R2 mirror (BUSYTEX_MIRROR_URL), GitHub release, upstream script; a stale mirror costs speed, never the build. Fetches the raw archive; build.mjs tries the processed copy first.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAW_ARCHIVE, UPSTREAM_URL, mirrorUrl, run, streamExtract, version } from './busytex-mirror.mjs';
import { FRONTEND_DIR } from './cli-path.mjs';

/** Fills `dest`/busytex unless it already has files; `dest` comes from code, never from the command line, because it reaches a spawned command. */
export async function fetchBusytex(dest) {
  const busytexDir = path.join(dest, 'busytex');
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

// `npm run dev` (predev): always static/core.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fetchBusytex(path.join(FRONTEND_DIR, 'static', 'core')).then(
    () => process.exit(0),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
