import { fileURLToPath } from 'node:url';
import { sveltekit } from '@sveltejs/kit/vite';
// defineConfig from vitest/config, not vite — it is the overload that knows
// about the `test` block below.
import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), wasm(), topLevelAwait(), sveltekit()],
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
