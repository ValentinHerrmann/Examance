import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

let data: Record<string, string> = {};
const memoryStorage = {
  getItem: (k: string) => data[k] ?? null,
  setItem: (k: string, v: string) => void (data[k] = v),
  removeItem: (k: string) => void delete data[k],
  clear: () => void (data = {}),
};

async function load() {
  vi.resetModules();
  return import('../src/lib/stores/penInput');
}

describe('penInput store (issue #233)', () => {
  beforeEach(() => {
    data = {};
    vi.stubGlobal('localStorage', memoryStorage);
  });

  it('reports the first pen once and remembers it per device', async () => {
    const pen = await load();
    expect(get(pen.penSeenStore)).toBe(false);
    expect(pen.markPenSeen()).toBe(true);
    expect(pen.markPenSeen()).toBe(false);
    expect(get(pen.penSeenStore)).toBe(true);
    expect(get((await load()).penSeenStore)).toBe(true);
  });

  it('lets fingers draw again after a reset, and tells about the next pen again', async () => {
    const pen = await load();
    pen.markPenSeen();
    pen.resetPenDetection();
    expect(get(pen.penSeenStore)).toBe(false);
    expect(get((await load()).penSeenStore)).toBe(false);
    expect(pen.markPenSeen()).toBe(true);
  });

  it('never throws without storage (private window)', async () => {
    const throwing = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: throwing, setItem: throwing, removeItem: throwing });
    const pen = await load();
    expect(get(pen.penSeenStore)).toBe(false);
    expect(pen.markPenSeen()).toBe(true);
    expect(() => pen.resetPenDetection()).not.toThrow();
  });
});
