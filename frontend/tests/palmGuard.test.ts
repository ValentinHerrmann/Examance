import { describe, expect, it } from 'vitest';
import { PALM_GRACE_MS, PalmGuard } from '../src/lib/components/grading/palmGuard';

// Regression (issue #321): a resting palm selected text and could tap buttons on iPad Safari while the pen wrote.
describe('PalmGuard', () => {
  it('blocks touches while a pen is down and for the grace period after it lifts', () => {
    const g = new PalmGuard();
    expect(g.blocksTouch(0)).toBe(false);
    g.penDown(1);
    expect(g.blocksTouch(10_000)).toBe(true);
    g.penUp(1, 1000);
    expect(g.blocksTouch(1000 + PALM_GRACE_MS - 1)).toBe(true);
    expect(g.blocksTouch(1000 + PALM_GRACE_MS)).toBe(false);
  });

  it('ignores the up of an unknown pen and releases stuck pens on reset', () => {
    const g = new PalmGuard();
    g.penUp(7, 1000);
    expect(g.blocksTouch(1000)).toBe(false);
    g.penDown(1);
    g.reset(2000);
    expect(g.blocksTouch(2000 + PALM_GRACE_MS)).toBe(false);
  });
});
