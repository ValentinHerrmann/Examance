import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sveltekit } from '@sveltejs/kit/vite';
// defineConfig from vitest/config, not vite — it is the overload that knows
// about the `test` block below.
import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import tailwindcss from '@tailwindcss/vite';

/**
 * Repository-root VERSION file — the single source of truth for the release
 * number, written by .github/workflows/deploy-release.yml from the release tag.
 * A dev checkout that predates it still has to build, hence the fallback.
 */
function readVersionFile(): string {
  try {
    return readFileSync(fileURLToPath(new URL('../VERSION', import.meta.url)), 'utf-8').trim();
  } catch {
    return '0.0.0';
  }
}

/**
 * PREVIEW_VERSION is written by .github/workflows/deploy-preview.yml's
 * `frontend` job as an extra commit on the `preview` branch, holding the full
 * `<release>-PR#<number> [<built-at>]` string composed there — Cloudflare
 * Pages has no notion of PR numbers, so this is the only way to get one into
 * the build. Absent on ad-hoc/manual preview builds that skip that job.
 */
function readPreviewVersionFile(): string {
  try {
    return readFileSync(fileURLToPath(new URL('../PREVIEW_VERSION', import.meta.url)), 'utf-8').trim();
  } catch {
    return '';
  }
}

/**
 * Cloudflare Pages sets CF_PAGES_BRANCH/CF_PAGES_COMMIT_SHA on every build.
 * `release` is the production branch; anything else (in practice `preview`) is
 * a preview deployment, so a preview build is never mistaken for the release
 * it was branched from.
 */
function computeAppVersion(): string {
  const branch = process.env.CF_PAGES_BRANCH;
  if (!branch) return '0.0.0-dev'; // local dev, vitest, ad-hoc builds
  if (branch === 'release') return readVersionFile();
  const preview = readPreviewVersionFile();
  if (preview) return preview;
  // Fallback for a preview build that never went through deploy-preview.yml
  // (e.g. a manual branch push straight to `preview`): short commit SHA.
  const sha = (process.env.CF_PAGES_COMMIT_SHA ?? '').slice(0, 7);
  return sha ? `${readVersionFile()}-${sha}` : readVersionFile();
}

/**
 * The GitHub repository this frontend is published from — used to build a
 * clickable link next to the version tag in the status bar (see
 * versionStore.ts): a release build links to its GitHub Release, a preview or
 * dev build links to the exact commit it was built from.
 */
const REPO_URL = 'https://github.com/ValentinHerrmann/Examance';

/** Full commit SHA of this build, when Cloudflare Pages provides one. */
function computeCommitSha(): string {
  return process.env.CF_PAGES_COMMIT_SHA ?? '';
}

// Seeds the backend address on a fresh browser profile so a production frontend
// defaults to the production API and a preview frontend to the preview API. It
// is only a default — the value is revalidated by normalizeBackendUrl() and the
// user can still point the app anywhere from the settings dialog.
const PROD_BACKEND_URL =
  process.env.PUBLIC_PROD_BACKEND_URL ?? 'https://api-examance.valentin-herrmann.com';
const PREVIEW_BACKEND_URL =
  process.env.PUBLIC_PREVIEW_BACKEND_URL ?? 'https://prev-api-examance.valentin-herrmann.com';

function computeDefaultBackendUrl(): string {
  if (process.env.PUBLIC_DEFAULT_BACKEND_URL) {
    return process.env.PUBLIC_DEFAULT_BACKEND_URL;
  }
  const branch = process.env.CF_PAGES_BRANCH;
  if (branch === 'release') return PROD_BACKEND_URL;
  if (branch) return PREVIEW_BACKEND_URL;
  return '';
}

export default defineConfig({
  plugins: [tailwindcss(), wasm(), topLevelAwait(), sveltekit()],
  define: {
    __APP_VERSION__: JSON.stringify(computeAppVersion()),
    __APP_COMMIT_SHA__: JSON.stringify(computeCommitSha()),
    __REPO_URL__: JSON.stringify(REPO_URL),
    __DEFAULT_BACKEND_URL__: JSON.stringify(computeDefaultBackendUrl()),
    __PROD_BACKEND_URL__: JSON.stringify(PROD_BACKEND_URL),
    __PREVIEW_BACKEND_URL__: JSON.stringify(PREVIEW_BACKEND_URL),
  },
  test: {
    alias: {
      'argon2-browser': fileURLToPath(new URL('./tests/mocks/argon2Mock.ts', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['argon2-browser'],
    include: ['texlyre-busytex'],
  },
  ssr: {
    external: ['argon2-browser'],
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      external: [/.*\.wasm$/],
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
