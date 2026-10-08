import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { describe, expect, it } from 'vitest';
import { remainingUntilLock } from '../src/lib/db/hygiene';

const HOUR = 60 * 60 * 1000;

describe('idle lock across tabs', () => {
  it('counts from the newest activity of any tab', () => {
    const now = 10 * HOUR;
    // This tab idle for 61 minutes, another tab active a minute ago: no lock yet.
    expect(remainingUntilLock(now - HOUR - 60_000, now - 60_000, now)).toBe(HOUR - 60_000);
    expect(remainingUntilLock(now - 60_000, 0, now)).toBe(HOUR - 60_000);
  });

  it('locks only once every tab has been idle for the full timeout', () => {
    const now = 10 * HOUR;
    expect(remainingUntilLock(now - HOUR, now - HOUR - 5_000, now)).toBeLessThanOrEqual(0);
  });
});
