import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: false,
      strict: true,
    }),
    alias: {
      $lib: './src/lib',
    },
    // NOTE: `kit.version.name` is deliberately left at its default (Date.now()).
    // It used to be pinned so the inline hydration script's SHA-256 stayed
    // stable for the hand-written CSP hash in static/_headers. That never
    // worked — the same script also embeds the content-hashed entry chunk
    // filenames, which change on any bundle change — and pinning the version
    // costs SvelteKit its "a new deployment exists" detection. The hash is now
    // derived from the build output by scripts/generate-csp-headers.mjs.
  },
};

export default config;
