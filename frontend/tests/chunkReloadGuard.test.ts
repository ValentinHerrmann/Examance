import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// The inline guard in src/app.html: a failed chunk import after an update reloads once, never in a loop.
const html = readFileSync(resolve(__dirname, '../src/app.html'), 'utf8');
// Cut by position around the guard's key, not by an HTML regex (app.html is our own file with plain <script> tags).
const keyAt = html.indexOf('bg_chunk_reload');
const openTag = '<script>';
const start = html.lastIndexOf(openTag, keyAt) + openTag.length;
const source = keyAt < 0 ? undefined : html.slice(start, html.indexOf('</script>', keyAt));

function boot(now: () => number) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const store = new Map<string, string>();
  const reload = vi.fn();
  const win = {
    addEventListener: (type: string, fn: (event: unknown) => void) => (listeners[type] = fn),
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
    location: { reload },
  };
  new Function('window', 'Date', source!)(win, { now });
  return { listeners, reload };
}

describe('chunk reload guard (app.html)', () => {
  it('exists', () => expect(source).toBeTruthy());

  it('reloads once on a failed dynamic import, not again within 5 minutes', () => {
    let t = 1_000_000;
    const { listeners, reload } = boot(() => t);
    const failure = { reason: new TypeError('Failed to fetch dynamically imported module: /_app/immutable/nodes/0.x.js') };
    listeners.unhandledrejection(failure);
    listeners.unhandledrejection(failure);
    expect(reload).toHaveBeenCalledTimes(1);
    t += 300_001;
    listeners['vite:preloadError']({});
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('ignores unrelated rejections', () => {
    const { listeners, reload } = boot(() => 0);
    listeners.unhandledrejection({ reason: new Error('ERR_NETWORK') });
    expect(reload).not.toHaveBeenCalled();
  });
});
