// `npm run build`: the Vite build plus the BusyTeX assets (~500 MB). On a clean checkout the
// assets are downloaded/processed in a staging dir alongside `vite build` and moved into build/
// afterwards (hides ~20 s, avoids Vite copying 500 MB twice). With BUSYTEX_MIRROR_URL set, the
// processed R2 copy is tried first (busytex-mirror.mjs). If static/core/busytex exists, nothing
// is staged.
import fs from 'node:fs';
import path from 'node:path';
import { PROCESSED_ARCHIVE, mirrorUrl, run, streamExtract } from './busytex-mirror.mjs';

const STATIC_BUSYTEX = path.resolve('static/core/busytex');
const STAGE_ROOT = path.resolve('.busytex');
const STAGED_BUSYTEX = path.join(STAGE_ROOT, 'core', 'busytex');
const BUILT_BUSYTEX = path.resolve('build/core/busytex');

const hasFiles = (dir) => fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
const viteBuild = () => run('npx', ['--no-install', 'vite', 'build']);

async function main() {
  if (hasFiles(STATIC_BUSYTEX)) {
    await run('node', ['scripts/process-large-files.mjs', 'static']);
    await viteBuild();
    return;
  }

  const started = Date.now();
  const busytex = (async () => {
    const processedUrl = hasFiles(STAGED_BUSYTEX) ? null : mirrorUrl(PROCESSED_ARCHIVE);
    if (processedUrl) {
      console.log(`Streaming processed BusyTeX assets from ${processedUrl}`);
      try {
        fs.mkdirSync(STAGE_ROOT, { recursive: true });
        await streamExtract(processedUrl, STAGE_ROOT, {
          gzip: false,
          expect: 'core/busytex/chunk-manifest.json',
        });
        console.log(`✓ BusyTeX assets staged (${((Date.now() - started) / 1000).toFixed(1)} s)`);
        return;
      } catch (err) {
        console.warn(`Processed mirror unavailable (${err.message}); processing the raw archive`);
      }
    }
    // fetch-busytex skips the download when the staging copy survived a
    // previous local build.
    await run('node', ['scripts/fetch-busytex.mjs', path.join(STAGE_ROOT, 'core')]);
    await run('node', ['scripts/process-large-files.mjs', STAGE_ROOT]);
    console.log(`✓ BusyTeX assets staged (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  })();
  // Both must settle before exiting, or a failed Vite build would leave the
  // BusyTeX step writing into .busytex/ after the error is reported.
  const [viteResult, busytexResult] = await Promise.allSettled([viteBuild(), busytex]);
  for (const result of [viteResult, busytexResult]) {
    if (result.status === 'rejected') throw result.reason;
  }

  fs.rmSync(BUILT_BUSYTEX, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(BUILT_BUSYTEX), { recursive: true });
  if (process.env.CF_PAGES) {
    // Same filesystem, so a rename instead of a 500 MB copy. The staging
    // directory is not reused on Cloudflare: every build starts clean.
    fs.renameSync(STAGED_BUSYTEX, BUILT_BUSYTEX);
  } else {
    // Keep the staged copy so the next local build skips the download.
    fs.cpSync(STAGED_BUSYTEX, BUILT_BUSYTEX, { recursive: true });
  }
  console.log(`✓ BusyTeX assets placed in ${path.relative(process.cwd(), BUILT_BUSYTEX)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
