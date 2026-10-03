# Frontend build, CSP headers and BusyTeX

Deployment topology is in `docs/deployment.md`. This file covers what bites during the build.

## Build

`npm run build` goes through `frontend/scripts/build.mjs`. Without `static/core/busytex` (every Cloudflare build) it fetches and gzips busytex into `frontend/.busytex/` *in parallel with* `vite build` and moves it into `build/` afterwards; with it, Vite copies it as usual. There is no `postinstall`: busytex is fetched by `predev` (into `static/core`) and by the build. Do not strip `predev`.

## Response headers / CSP

Response headers come from `frontend/static/_headers`, which is a **template**. `npm run build` runs `scripts/generate-csp-headers.mjs`, which replaces the `__INLINE_SCRIPT_HASHES__` token in `script-src` with the SHA-256 of every inline script in `build/**/*.html`.

- **Never hard-code a `sha256-` literal there.** SvelteKit's inline bootstrap embeds the content-hashed entry chunk filenames, so its hash changes with any bundle change (including a dependency or Node version difference between your machine and the Pages build image). A pinned hash takes the deployed app down with "Executing inline script violates the following Content Security Policy directive". `tests/cspHeaders.test.ts` guards this.
- The no-flash theme script in `app.html` is hashed like any other inline script.
- The policy is `script-src 'self'` with no CDN allowances. Third-party assets (e.g. the pdf.js worker, see `src/lib/pdf/pdfjs.ts`) must be bundled and served from our own origin: required by the CSP and by the "no third-party transfer" claims in `docs/`.

## Diagnosing a CSP console error on a deployed stack

A console error reading `Executing inline script violates the following Content Security Policy directive 'script-src 'self' …'` on a deployed stack is **not** a CORS error and **not** a build failure. It means a Cloudflare dashboard feature (Web Analytics above all, also Rocket Loader and Email Obfuscation) is rewriting the HTML after the build hashed it. Turn the feature off; never widen `script-src`.

`lib/utils/cspDiagnostics.ts` says so at runtime, `npm run csp:verify` guards the build side, and `docs/deployment.md` has the full checklist.

## BusyTeX mirror

Pages builds fetch BusyTeX already chunked from an R2 mirror (`BUSYTEX_MIRROR_URL`, filled by `mirror-busytex.yml`; object names keyed on version + a hash of `process-large-files.mjs` / `fetch-interceptor.js` in `scripts/busytex-mirror.mjs`) before falling back to the raw archive / GitHub. See `docs/deployment.md` §5.
