import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inlineScriptHashes, PLACEHOLDER } from '../scripts/generate-csp-headers.mjs';

const headersTemplate = readFileSync(
  fileURLToPath(new URL('../static/_headers', import.meta.url)),
  'utf-8'
);

const srcDir = fileURLToPath(new URL('../src', import.meta.url));

/**
 * Hosts the app is allowed to name in source. Everything here is either an
 * XML namespace (never fetched), a placeholder shown in a form field, or a
 * same-machine dev address — none of them contact a third party at runtime.
 */
const ALLOWED_HOSTS = new Set(['www.w3.org', 'localhost', 'api.example.org']);

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (/\.(ts|js|svelte|css)$/.test(entry.name)) found.push(full);
  }
  return found;
}

describe('CSP header generation', () => {
  it('hashes the SvelteKit inline bootstrap exactly as a browser would', () => {
    // Byte-for-byte copy of a real adapter-static index.html bootstrap.
    const html = '<div style="display: contents"><script>\n\t\t\t\tconsole.log(1);\n\t\t\t</script></div>';
    // Independently computed: sha256 of the raw text between the tags.
    expect(inlineScriptHashes(html)).toEqual([
      'sha256-cUDChe7f5Rvy/AtvgoTm8fkdjBh5+LF7/nPechWDpiE=',
    ]);
  });

  it('ignores external scripts and inert JSON payloads', () => {
    const html = [
      '<script src="/_app/immutable/entry/app.D5rWE36V.js"></script>',
      '<script type="application/json" data-sveltekit-fetched>{"a":1}</script>',
      '<script type="module">export default 1;</script>',
    ].join('');
    expect(inlineScriptHashes(html)).toHaveLength(1);
  });

  it('keeps the placeholder in static/_headers so the build can fill it in', () => {
    // A hard-coded sha256- literal here means someone pinned a hash by hand
    // again; it will go stale on the next Cloudflare Pages build.
    expect(headersTemplate).toContain(PLACEHOLDER);
    expect(headersTemplate).not.toMatch(/'sha256-[^']+'/);
  });
});

describe('the deployed origin is self-contained', () => {
  // The CSP is `default-src 'self'` with no CDN allowances, and docs/ tells
  // schools the browser contacts no external host. Two regressions already got
  // past review: the pdf.js worker loaded from cdnjs.cloudflare.com on five
  // call sites, and HttpCatModal fetched an image from http.cat on every API
  // error — each one leaking the user's IP and User-Agent to a third party.
  // This is the check that would have caught both.
  it('names no off-origin host in src/', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(srcDir)) {
      const contents = readFileSync(file, 'utf-8');
      for (const [, host] of contents.matchAll(/https?:\/\/([a-zA-Z0-9._-]+)/g)) {
        if (!ALLOWED_HOSTS.has(host)) {
          offenders.push(`${file.slice(srcDir.length + 1)} → ${host}`);
        }
      }
    }
    // Bundle the asset and serve it from our own origin instead. If a new host
    // genuinely belongs here, it needs a connect-src/img-src entry in
    // static/_headers and a recipients entry in the Art. 30 record first.
    expect(offenders).toEqual([]);
  });
});
