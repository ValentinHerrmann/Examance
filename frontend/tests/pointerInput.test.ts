import { describe, expect, it } from 'vitest';
import { drawsWith, PointerRouter } from '../src/lib/components/grading/pointerInput';

const at = (pointerId: number, pointerType: string, x = 0, y = 0) => ({ pointerId, pointerType, x, y, button: 0 });

describe('drawsWith (issue #233)', () => {
  it('lets pen and mouse always draw, a finger only until a pen was seen', () => {
    expect(drawsWith('pen', true)).toBe(true);
    expect(drawsWith('mouse', true)).toBe(true);
    expect(drawsWith('touch', false)).toBe(true);
    expect(drawsWith('touch', true)).toBe(false);
  });
});

describe('PointerRouter', () => {
  it('remembers a pen and stops fingers drawing from then on', () => {
    const r = new PointerRouter(false);
    expect(r.down(at(1, 'pen')).kind).toBe('draw');
    r.up(1);
    expect(r.penSeen).toBe(true);
    expect(r.down(at(2, 'touch')).kind).toBe('pan');
  });

  it('never lets a resting palm end or pinch the pen stroke', () => {
    const r = new PointerRouter(true);
    expect(r.down(at(1, 'pen')).kind).toBe('draw');
    expect(r.down(at(2, 'touch')).kind).toBe('pan');
    expect(r.drawing).toBe(true);
    expect(r.isDrawPointer(1)).toBe(true);
    expect(r.up(2)).toEqual({ endedDraw: false, endedPinch: false });
    expect(r.up(1).endedDraw).toBe(true);
  });

  it('pinches with two fingers once a pen is known', () => {
    const r = new PointerRouter(true);
    r.down(at(1, 'touch', 0, 0));
    expect(r.down(at(2, 'touch', 10, 0)).kind).toBe('pinch');
    expect(r.moveNav(at(2, 'touch', 20, 0))).toEqual({ pinch: [{ x: 0, y: 0 }, { x: 20, y: 0 }] });
    expect(r.up(1).endedPinch).toBe(true);
  });

  it('turns a drawing finger into a pinch when a second finger lands (no pen)', () => {
    const r = new PointerRouter(false);
    r.down(at(1, 'touch', 0, 0));
    r.moveDraw(at(1, 'touch', 5, 5));
    expect(r.down(at(2, 'touch', 10, 10))).toEqual({ kind: 'pinch-from-draw', a: { x: 5, y: 5 }, b: { x: 10, y: 10 } });
    expect(r.drawing).toBe(false);
    expect(r.navCount).toBe(2);
  });

  it('pans by the finger delta', () => {
    const r = new PointerRouter(true);
    r.down(at(1, 'touch', 100, 100));
    expect(r.moveNav(at(1, 'touch', 90, 80))).toEqual({ pan: { x: 10, y: 20 } });
  });

  // Regression: a pointer whose up never arrived kept the viewer in pinch mode for good, so nothing drew any more.
  it('clears a cancelled pointer by id and recovers after reset', () => {
    const r = new PointerRouter(true);
    r.down(at(1, 'touch'));
    r.down(at(2, 'touch'));
    r.up(2); // pointercancel
    expect(r.navCount).toBe(1);
    r.reset();
    expect(r.navCount).toBe(0);
    expect(r.down(at(3, 'pen')).kind).toBe('draw');
  });

  it('lets a new pen contact replace a drawer whose up event was lost', () => {
    const r = new PointerRouter(true);
    r.down(at(1, 'pen'));
    expect(r.down(at(4, 'pen')).kind).toBe('draw');
    expect(r.isDrawPointer(4)).toBe(true);
    expect(r.up(1).endedDraw).toBe(false);
  });

  it('ignores secondary mouse buttons', () => {
    const r = new PointerRouter(false);
    expect(r.down({ ...at(1, 'mouse'), button: 2 }).kind).toBe('ignore');
  });
});
