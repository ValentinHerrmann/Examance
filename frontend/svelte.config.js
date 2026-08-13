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
    // Pin the build "version" instead of letting SvelteKit default to
    // Date.now(). That value is embedded verbatim in the inline hydration
    // <script> SvelteKit injects into every prerendered page (as the
    // `__sveltekit_<hash>` global). If it changes on every build, so does
    // the script's SHA-256 hash — which breaks the pinned `script-src`
    // hash we ship in frontend/static/_headers for Cloudflare Pages.
    version: {
      name: 'examance-static',
    },
  },
};

export default config;
