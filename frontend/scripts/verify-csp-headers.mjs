#!/usr/bin/env node
/**
 * Fails the build if an inline script in `build/**\/*.html` is missing from the
 * `script-src` in `build/_headers` — a deployed app would otherwise render blank.
 * Scripts injected after the build (Cloudflare Web Analytics) are out of reach
 * here; see docs/deployment.md, "Cloudflare dashboard settings".
 *
 * Usage: node scripts/verify-csp-headers.mjs [buildDir]
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { PLACEHOLDER, htmlFiles, inlineScriptHashes } from './generate-csp-headers.mjs';

const buildDir = resolve(process.argv[2] ?? 'build');
const headersPath = join(buildDir, '_headers');

function fail(message) {
  console.error(`[CSP] ${message}`);
  process.exit(1);
}

if (!existsSync(headersPath)) fail(`${headersPath} not found — run the build first.`);
const headers = readFileSync(headersPath, 'utf-8');
if (headers.includes(PLACEHOLDER)) fail('Placeholder still in build/_headers — csp:headers did not run.');

const pages = htmlFiles(buildDir);
const missing = pages.flatMap((page) =>
  inlineScriptHashes(readFileSync(page, 'utf-8'))
    .filter((hash) => !headers.includes(hash))
    .map((hash) => `${relative(buildDir, page)} → ${hash}`)
);
if (missing.length > 0) {
  fail(`Inline scripts not covered by build/_headers:\n      ${missing.join('\n      ')}`);
}
console.log(`[CSP] All inline scripts across ${pages.length} HTML file(s) are covered.`);
