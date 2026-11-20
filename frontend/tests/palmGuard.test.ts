// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ownTouches,
  PALM_GRACE_MS,
  palmGuard,
  PalmGuard,
  PEN_STALE_MS,
  releaseTextFocus
} from '../src/lib/components/grading/palmGuard';

let clock = 0;
vi.spyOn(performance, 'now').mockImplementation(() => clock);

/** A cancelable event with extra fields set on it (jsdom's TouchEvent cannot carry them). */
function fire(target: EventTarget, type: string, extra: Record<string, unknown> = {}): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries(extra)) Object.defineProperty(e, key, { value });
  target.dispatchEvent(e);
  return e;
}

function click(target: EventTarget, pointerType: string, pointerId: number): Event {
  const e = new PointerEvent('click', { bubbles: true, cancelable: true, pointerType, pointerId });
  target.dispatchEvent(e);
  return e;
}

function mount() {
  const root = document.createElement('div');
  const button = document.createElement('button');
  const outside = document.createElement('span');
  const input = document.createElement('input');
  root.append(button, input);
  document.body.append(root, outside);
  const action = palmGuard(root, true);
  return { root, button, outside, input, action };
}

afterEach(() => {
  document.body.replaceChildren();
  clock = 0;
});

// Regression (issue #321): a resting palm selected text and could tap buttons on iPad Safari while the pen wrote.
describe('PalmGuard', () => {
  it('blocks touches while a pen is down and for the grace period after it lifts', () => {
    const g = new PalmGuard();
    expect(g.blocksTouch(0)).toBe(false);
    g.penDown(1, 0);
    expect(g.blocksTouch(1000)).toBe(true);
    g.penUp(1, 1000);
    expect(g.blocksTouch(1000 + PALM_GRACE_MS - 1)).toBe(true);
    expect(g.blocksTouch(1000 + PALM_GRACE_MS)).toBe(false);
  });

  it('ignores the up of an unknown pen and releases stuck pens on reset', () => {
    const g = new PalmGuard();
    g.penUp(7, 1000);
    expect(g.blocksTouch(1000)).toBe(false);
    g.penDown(1, 1500);
    g.reset(2000);
    expect(g.blocksTouch(2000 + PALM_GRACE_MS)).toBe(false);
  });

  it('expires a pen whose up event never arrived, and ends contact on a hover move', () => {
    const g = new PalmGuard();
    g.penDown(1, 0);
    g.penMove(1, 1000, 1);
    expect(g.blocksTouch(1000 + PEN_STALE_MS - 1)).toBe(true);
    expect(g.blocksTouch(1000 + PEN_STALE_MS + PALM_GRACE_MS)).toBe(false);
    g.penDown(2, 10_000);
    g.penMove(2, 10_100, 0);
    expect(g.blocksTouch(10_100 + PALM_GRACE_MS)).toBe(false);
  });
});

describe('palmGuard clicks', () => {
  it('swallows the click of a blocked touch, never a pen or mouse click', () => {
    const { button, action } = mount();
    fire(button, 'pointerdown', { pointerType: 'pen', pointerId: 1 });
    fire(button, 'pointerdown', { pointerType: 'touch', pointerId: 2 });
    expect(click(button, 'pen', 1).defaultPrevented).toBe(false);
    expect(click(button, 'mouse', 1).defaultPrevented).toBe(false);
    expect(click(button, 'touch', 2).defaultPrevented).toBe(true);
    action.destroy();
  });
});

// Regression (issue #321): Safari's Apple Pencil gestures selected navbar text and cancelled short strokes.
describe('ownTouches', () => {
  it('cancels touch events on the scan stack until destroyed', () => {
    const node = document.createElement('div');
    const action = ownTouches(node);
    expect(fire(node, 'touchstart').defaultPrevented).toBe(true);
    expect(fire(node, 'touchmove').defaultPrevented).toBe(true);
    action.destroy();
    expect(fire(node, 'touchstart').defaultPrevented).toBe(false);
  });
});

describe('palmGuard selectstart', () => {
  it('blocks page-wide selection around pen contact, never in text fields', () => {
    const { root, outside, input, action } = mount();
    expect(fire(outside, 'selectstart').defaultPrevented).toBe(false);
    clock = 1000;
    fire(root, 'pointerdown', { pointerType: 'pen', pointerId: 1 });
    clock = 1100;
    expect(fire(outside, 'selectstart').defaultPrevented).toBe(true);
    expect(fire(input, 'selectstart').defaultPrevented).toBe(false);
    clock = 2000;
    fire(root, 'pointerup', { pointerType: 'pen', pointerId: 1 });
    clock = 2000 + PALM_GRACE_MS - 1;
    expect(fire(outside, 'selectstart').defaultPrevented).toBe(true);
    clock = 2000 + PALM_GRACE_MS;
    expect(fire(outside, 'selectstart').defaultPrevented).toBe(false);
    action.destroy();
  });
});

// Regression (review of issue #321): cancelled scan touches kept a score field focused and the iPad keyboard over the scan.
describe('releaseTextFocus', () => {
  it('blurs a focused text field only', () => {
    const { input, button } = mount();
    input.focus();
    releaseTextFocus();
    expect(document.activeElement).not.toBe(input);
    button.focus();
    releaseTextFocus();
    expect(document.activeElement).toBe(button);
  });
});
