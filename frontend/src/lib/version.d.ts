/**
 * Build-time constants substituted by Vite's `define` (see vite.config.ts).
 * They are plain string literals inlined into the bundled chunks, not runtime
 * globals — nothing reads them off `window`, and no inline script is involved,
 * so the CSP hashing in scripts/generate-csp-headers.mjs is unaffected.
 */
declare const __APP_VERSION__: string;
declare const __DEFAULT_BACKEND_URL__: string;
