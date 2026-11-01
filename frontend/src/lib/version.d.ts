/** Build-time constants substituted by Vite's `define` (see vite.config.ts): inlined string literals, not runtime globals, so CSP hashing in scripts/generate-csp-headers.mjs is unaffected. */
declare const __APP_VERSION__: string;
/** True for Cloudflare Pages preview builds (branch other than `release`); drives the corner banner. */
declare const __IS_PREVIEW__: boolean;
declare const __APP_COMMIT_SHA__: string;
/** GitHub Release body of this build's version (markdown), '' if none. */
declare const __RELEASE_NOTES__: string;
declare const __REPO_URL__: string;
declare const __DOCS_URL__: string;
declare const __DEFAULT_BACKEND_URL__: string;
declare const __PROD_BACKEND_URL__: string;
declare const __PREVIEW_BACKEND_URL__: string;
/** Old address this build retires, or null (scripts/domain-move.mjs, issue #198). */
declare const __DOMAIN_MOVE__: { from: string; fromBackendUrl: string; to: string; deadline: string } | null;

/** Operator details for the legal pages, inlined from the build environment the same way (docs/hosting.md section 5.1); never committed. */
interface ImportMetaEnv {
  readonly VITE_LEGAL_NAME?: string;
  readonly VITE_LEGAL_STREET?: string;
  readonly VITE_LEGAL_POSTCODE_CITY?: string;
  readonly VITE_LEGAL_EMAIL?: string;
  readonly VITE_LEGAL_PHONE?: string;
}
