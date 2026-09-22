#!/usr/bin/env node
/**
 * verify-csp-headers.mjs
 *
 * Fails the build if any inline script in `build/**\/*.html` is missing from the
 * `script-src` in `build/_headers`.
 *
 * `generate-csp-headers.mjs` derives those hashes from the build output, so in
 * principle they always match. This checks it anyway, because the failure mode
 * is remote and expensive: the app deploys, renders a blank page, and the
 * browser reports only
 *
 *     Executing inline script violates the following Content Security Policy
 *     directive 'script-src 'self' …'
 *
 * which reads like a CORS or server problem and has, in this project, been
 * mistaken for one. Catching it here turns a broken deploy into a failed build.
 *
 * Note what this cannot catch: a script injected *after* the build, on the
 * Cloudflare edge. That is what Web Analytics does, and it is the usual cause
 * of that error in production — see docs/deployment.md, "Cloudflare dashboard
 * settings". The runtime listener in `routes/+layout.svelte` covers that case.
 *
 * Usage: node scripts/verify-csp-headers.mjs [buildDir]
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { inlineScriptHashes } from './generate-csp-headers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = resolve(root, process.argv[2] ?? 'build');
const headersPath = join(buildDir, '_headers');

/**
 * @param {string} dir
 * @returns {string[]}
 */
async function htmlFiles(dir) {
  const { readdirSync } = await import('node:fs');
  /** @type {string[]} */
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await htmlFiles(full)));
    else if (entry.isFile() && entry.name.endsWith('.html')) found.push(full);
  }
  return found;
}

async function main() {
  if (!existsSync(headersPath)) {
    console.error(`[CSP] ${relative(root, headersPath)} not found — run the build first.`);
    process.exit(1);
  }

  const headers = readFileSync(headersPath, 'utf-8');

  if (headers.includes('__INLINE_SCRIPT_HASHES__')) {
    console.error(
      '[CSP] The placeholder is still in build/_headers — the csp:headers step ' +
        'did not run. Every inline script would be blocked.'
    );
    process.exit(1);
  }

  const pages = await htmlFiles(buildDir);
  /** @type {string[]} */
  const missing = [];

  for (const page of pages) {
    for (const hash of inlineScriptHashes(readFileSync(page, 'utf-8'))) {
      if (!headers.includes(hash)) {
        missing.push(`${relative(buildDir, page)} → ${hash}`);
      }
    }
  }

  if (missing.length > 0) {
    console.error('[CSP] Inline scripts are not covered by the policy in build/_headers:');
    for (const entry of missing) console.error(`      ${entry}`);
    console.error(
      '[CSP] The deployed app would render blank. Re-run `npm run csp:headers` ' +
        'after any step that rewrites the built HTML.'
    );
    process.exit(1);
  }

  console.log(`[CSP] All inline scripts across ${pages.length} HTML file(s) are covered.`);
}

main();
