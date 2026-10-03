#!/usr/bin/env node
/**
 * Rewrites the `__INLINE_SCRIPT_HASHES__` placeholder in `build/_headers` with the SHA-256
 * of every inline <script> in the built HTML. SvelteKit's bootstrap script embeds hashed chunk
 * filenames, so its hash changes with any bundle change and a hand-written one goes stale
 * (blank deployed app, fine in dev). Fail-closed: if this never runs, the placeholder stays,
 * the script stays blocked and the app breaks loudly instead of shipping a weaker policy.
 * Usage: node scripts/generate-csp-headers.mjs [buildDir]
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = resolve(root, process.argv[2] ?? 'build');
// Read the template from source and write the resolved copy into the build
// output, so re-running the step is idempotent rather than a hard error.
const templatePath = join(root, 'static', '_headers');
const headersPath = join(buildDir, '_headers');

export const PLACEHOLDER = '__INLINE_SCRIPT_HASHES__';

// Inline <script> elements only count against script-src when the browser
// treats them as executable. `type="application/json"` payloads (SvelteKit
// emits those for prerendered fetch data) are inert and need no hash.
const EXECUTABLE_TYPES = new Set([
  '',
  'module',
  'importmap',
  'text/javascript',
  'application/javascript',
]);

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

/**
 * Collect the CSP hashes of the executable inline scripts in one HTML document.
 * @param {string} html
 * @returns {string[]}
 */
export function inlineScriptHashes(html) {
  /** @type {string[]} */
  const hashes = [];
  for (const [, rawAttrs, body] of html.matchAll(SCRIPT_RE)) {
    if (/\bsrc\s*=/i.test(rawAttrs)) continue; // external, covered by 'self'
    const type = (rawAttrs.match(/\btype\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i) ?? [])
      .slice(2)
      .find((/** @type {string | undefined} */ value) => value !== undefined);
    if (!EXECUTABLE_TYPES.has((type ?? '').trim().toLowerCase())) continue;
    // The hash covers the element's text content verbatim — no trimming, no
    // normalisation. Any whitespace change is a different script to the CSP.
    hashes.push(`sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`);
  }
  return hashes;
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
export function htmlFiles(dir) {
  /** @type {string[]} */
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...htmlFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.html')) found.push(full);
  }
  return found;
}

function main() {
  if (!existsSync(buildDir)) {
    console.error(`[CSP] ${relative(root, buildDir)} not found — run the build first.`);
    process.exit(1);
  }
  if (!existsSync(templatePath)) {
    console.error(`[CSP] Template ${relative(root, templatePath)} is missing.`);
    process.exit(1);
  }

  const template = readFileSync(templatePath, 'utf-8');
  if (!template.includes(PLACEHOLDER)) {
    console.error(
      `[CSP] No ${PLACEHOLDER} placeholder in static/_headers. Someone pinned ` +
        'hashes by hand again — put the placeholder back in script-src, it is ' +
        'what makes the policy survive a rebuild.'
    );
    process.exit(1);
  }

  const pages = htmlFiles(buildDir);
  if (pages.length === 0) {
    console.error(`[CSP] No HTML files under ${relative(root, buildDir)} — nothing to hash.`);
    process.exit(1);
  }

  const hashes = new Set();
  for (const page of pages) {
    for (const hash of inlineScriptHashes(readFileSync(page, 'utf-8'))) hashes.add(hash);
  }

  if (hashes.size === 0) {
    // Legitimate if SvelteKit ever stops emitting the bootstrap, but far more
    // likely a sign the extraction broke. Say so rather than pass silently.
    console.warn('[CSP] No executable inline scripts found. script-src will carry no hashes.');
  }

  const sorted = [...hashes].sort();
  writeFileSync(
    headersPath,
    template.replaceAll(PLACEHOLDER, sorted.map((hash) => `'${hash}'`).join(' ')),
    'utf-8'
  );

  console.log(
    `[CSP] Pinned ${sorted.length} inline script hash(es) from ${pages.length} HTML file(s):`
  );
  for (const hash of sorted) console.log(`      ${hash}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
