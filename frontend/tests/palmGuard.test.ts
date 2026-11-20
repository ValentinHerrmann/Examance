// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ownTouches, PALM_GRACE_MS, palmGuard, PalmGuard } from '../src/lib/components/grading/palmGuard';

/** A cancelable event with a fixed time stamp and extra fields (jsdom has no reliable PointerEvent/TouchEvent constructors). */
function fire(target: EventTarget, type: string, timeStamp: number, extra: Record<string, unknown> = {}): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'timeStamp', { value: timeStamp });
  for (const [key, value] of Object.entries(extra)) Object.defineProperty(e, key, { value });
  target.dispatchEvent(e);
  return e;
}

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

// Regression (issue #321): Safari's Apple Pencil gestures selected navbar text and cancelled short strokes.
describe('ownTouches', () => {
  it('cancels touch events on the scan stack until destroyed', () => {
    const node = document.createElement('div');
    const action = ownTouches(node);
    expect(fire(node, 'touchstart', 0).defaultPrevented).toBe(true);
    expect(fire(node, 'touchmove', 0).defaultPrevented).toBe(true);
    action.destroy();
    expect(fire(node, 'touchstart', 0).defaultPrevented).toBe(false);
  });
});

describe('palmGuard selectstart', () => {
  it('blocks page-wide selection around pen contact, never in text fields', () => {
    const root = document.createElement('div');
    const outside = document.createElement('span');
    const input = document.createElement('input');
    document.body.append(root, outside, input);
    const action = palmGuard(root, false);

    expect(fire(outside, 'selectstart', 0).defaultPrevented).toBe(false);
    fire(root, 'pointerdown', 1000, { pointerType: 'pen', pointerId: 1 });
    expect(fire(outside, 'selectstart', 1100).defaultPrevented).toBe(true);
    expect(fire(input, 'selectstart', 1100).defaultPrevented).toBe(false);
    fire(root, 'pointerup', 2000, { pointerType: 'pen', pointerId: 1 });
    expect(fire(outside, 'selectstart', 2000 + PALM_GRACE_MS - 1).defaultPrevented).toBe(true);
    expect(fire(outside, 'selectstart', 2000 + PALM_GRACE_MS).defaultPrevented).toBe(false);

    action.destroy();
    root.remove();
    outside.remove();
    input.remove();
  });
});
