import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inlineScriptHashes, PLACEHOLDER } from '../scripts/generate-csp-headers.mjs';

const headersTemplate = readFileSync(
  fileURLToPath(new URL('../static/_headers', import.meta.url)),
  'utf-8'
);

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
