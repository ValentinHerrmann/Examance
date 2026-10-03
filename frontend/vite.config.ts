import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
// vitest/config's defineConfig knows about the `test` block below.
import { defineConfig, type Plugin } from 'vitest/config';
import wasm from 'vite-plugin-wasm';
import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';

/**
 * argon2-bundled.min.js is a UMD bundle calling `}(this, …)`; served as native ESM (dev, optimizeDeps
 * exclude) `this` is undefined and it crashes. Rewrite it to `globalThis` and add a default export.
 */
function argon2BundlePlugin(): Plugin {
  return {
    name: 'argon2-bundle-umd-fix',
    transform(code: string, id: string) {
      if (id.includes('argon2-bundled.min.js')) {
        let transformed = code.replace('}(this,', '}(globalThis,');
        transformed += '\nexport default (typeof globalThis !== "undefined" ? globalThis.argon2 : undefined);\n';
        return { code: transformed, map: null };
      }
    },
  };
}

/** Root VERSION file (release number, written by deploy-release.yml); falls back for older checkouts. */
function readVersionFile(): string {
  try {
    return readFileSync(fileURLToPath(new URL('../VERSION', import.meta.url)), 'utf-8').trim();
  } catch {
    return '0.0.0';
  }
}

/** PREVIEW_VERSION (`<release>-PR#<n> [<built-at>]`) is committed by deploy-preview.yml; Pages knows no PR numbers. */
function readPreviewVersionFile(): string {
  try {
    return readFileSync(fileURLToPath(new URL('../PREVIEW_VERSION', import.meta.url)), 'utf-8').trim();
  } catch {
    return '';
  }
}

/** Pages sets CF_PAGES_BRANCH: `release` is production, anything else a preview, never mistaken for its release. */
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

/** Linked next to the version tag: release builds link their GitHub Release, others their commit. */
const REPO_URL = 'https://github.com/ValentinHerrmann/Examance';

/** Full commit SHA of this build, when Cloudflare Pages provides one. */
function computeCommitSha(): string {
  return process.env.CF_PAGES_COMMIT_SHA ?? '';
}

// Default backend for a fresh profile (production vs preview API); still revalidated and user-changeable.
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
  plugins: [
    tailwindcss(),
    wasm(),
    argon2BundlePlugin(),
    // SvelteKit 3 reads its config here (svelte.config.js is gone). `version.name` stays at its
    // default so "new deployment" detection works; the CSP hash comes from the build output.
    sveltekit({
      adapter: adapter({ pages: 'build', assets: 'build', fallback: 'index.html', precompress: false, strict: true }),
      preprocess: vitePreprocess(),
    }),
    // No-op outside Vitest; inside it, resolves Svelte's browser build for jsdom.
    svelteTesting(),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(computeAppVersion()),
    __APP_COMMIT_SHA__: JSON.stringify(computeCommitSha()),
    __REPO_URL__: JSON.stringify(REPO_URL),
    __DEFAULT_BACKEND_URL__: JSON.stringify(computeDefaultBackendUrl()),
    __PROD_BACKEND_URL__: JSON.stringify(PROD_BACKEND_URL),
    __PREVIEW_BACKEND_URL__: JSON.stringify(PREVIEW_BACKEND_URL),
  },
  test: {
    // Vitest must only pick up unit tests: the Playwright specs under e2e/
    // are named *.spec.ts, which Vitest's default include pattern also matches.
    include: ['tests/**/*.test.ts'],
    alias: {
      'argon2-browser/dist/argon2-bundled.min.js': fileURLToPath(
        new URL('./tests/mocks/argon2Mock.ts', import.meta.url)
      ),
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
    // ES2022 includes native top-level await, so no TLA transform plugin is
    // needed — vite-plugin-top-level-await re-parsed every chunk with SWC and
    // cost ~10 s per Cloudflare Pages build.
    target: 'es2022',
    // Gzip-sizing every chunk only feeds the build log and cost ~9 s per
    // Cloudflare Pages build.
    reportCompressedSize: false,
    rolldownOptions: {
      external: [/.*\.wasm$/],
      // No `output.*FileNames` overrides here — SvelteKit owns the output
      // layout and ignores them, always emitting under `_app/immutable/`,
      // which is what `static/_headers` targets.
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
