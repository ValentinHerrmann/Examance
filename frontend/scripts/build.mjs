// `npm run build` entry point: the Vite build plus the BusyTeX assets.
//
// The BusyTeX assets (~500 MB of TeX Live bundles) need no bundling, only a
// download, an extract and a gzip/split pass (process-large-files.mjs). On a
// clean checkout — every Cloudflare Pages build — that work runs in a staging
// directory *alongside* `vite build` instead of before it, and the result is
// moved into build/ afterwards. That hides ~20 s of download and compression
// behind the Vite build, and keeps 500 MB out of static/, which Vite and
// adapter-static would otherwise copy twice (static/ -> .svelte-kit/output ->
// build/).
//
// With BUSYTEX_MIRROR_URL set, the staging step first tries the already
// processed copy in the R2 mirror (busytex-mirror.mjs), which needs no gzip
// pass at all — that pass competed with Vite for the CPU. Without it, or when
// that object is missing, it downloads the raw archive and processes it here.
//
// When static/core/busytex already exists (a dev checkout after `npm run dev`),
// Vite copies it into build/ as before and nothing is staged.
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
