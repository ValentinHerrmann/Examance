/** Palm rejection outside the scan (issue #321): while a pen writes, and briefly after, a finger or palm touching the grading page never taps, focuses or selects anything. The scan stack routes its own touches (`pointerInput.ts`). */

/** How long after the pen lifts a touch still counts as the resting palm. */
export const PALM_GRACE_MS = 500;
/** How long after a blocked touch its click is still swallowed (browsers fire click on release). */
const CLICK_WINDOW_MS = 700;
/** Elements marked with this attribute (the scan stack) handle their own touches. */
export const PALM_GUARD_SKIP = 'data-palm-guard-skip';

/** Pen contact timing, free of DOM so it can be unit-tested. */
export class PalmGuard {
  private readonly pens = new Set<number>();
  private lastPenUp = Number.NEGATIVE_INFINITY;

  penDown(pointerId: number): void {
    this.pens.add(pointerId);
  }

  penUp(pointerId: number, now: number): void {
    if (this.pens.delete(pointerId)) this.lastPenUp = now;
  }

  blocksTouch(now: number): boolean {
    return this.pens.size > 0 || now - this.lastPenUp < PALM_GRACE_MS;
  }

  /** Forgets pens whose up event never arrived (window blur). */
  reset(now: number): void {
    if (this.pens.size > 0) this.lastPenUp = now;
    this.pens.clear();
  }
}

function skipped(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${PALM_GUARD_SKIP}]`) !== null;
}

/** Svelte action for the grade page root; `enabled` follows `penSeenStore`, so devices without a pen keep every tap. */
export function palmGuard(node: HTMLElement, enabled: boolean) {
  let on = enabled;
  const guard = new PalmGuard();
  let blockedTouchAt = Number.NEGATIVE_INFINITY;

  const onPenDown = (e: PointerEvent) => {
    if (e.pointerType === 'pen') guard.penDown(e.pointerId);
  };
  const onPenUp = (e: PointerEvent) => {
    if (e.pointerType === 'pen') guard.penUp(e.pointerId, e.timeStamp);
  };
  const onBlur = () => guard.reset(performance.now());

  // iOS Safari: cancelling the touch stops its focus, click and text selection; the Pencil's own touches (`touchType` stylus) pass.
  const onTouchStart = (e: TouchEvent) => {
    if (!on || skipped(e.target) || !guard.blocksTouch(e.timeStamp)) return;
    const stylus = Array.from(e.changedTouches).some((t) => (t as Touch & { touchType?: string }).touchType === 'stylus');
    if (!stylus && e.cancelable) e.preventDefault();
  };
  // Other browsers: remember the blocked touch and swallow the click it produces.
  const onPointerDown = (e: PointerEvent) => {
    if (on && e.pointerType === 'touch' && !skipped(e.target) && guard.blocksTouch(e.timeStamp)) blockedTouchAt = e.timeStamp;
  };
  const onClick = (e: MouseEvent) => {
    if (!on || e.timeStamp - blockedTouchAt > CLICK_WINDOW_MS) return;
    blockedTouchAt = Number.NEGATIVE_INFINITY;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  window.addEventListener('pointerdown', onPenDown, true);
  window.addEventListener('pointerup', onPenUp, true);
  window.addEventListener('pointercancel', onPenUp, true);
  window.addEventListener('blur', onBlur);
  node.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
  node.addEventListener('pointerdown', onPointerDown, true);
  node.addEventListener('click', onClick, true);

  return {
    update(next: boolean) {
      on = next;
    },
    destroy() {
      window.removeEventListener('pointerdown', onPenDown, true);
      window.removeEventListener('pointerup', onPenUp, true);
      window.removeEventListener('pointercancel', onPenUp, true);
      window.removeEventListener('blur', onBlur);
      node.removeEventListener('touchstart', onTouchStart, true);
      node.removeEventListener('pointerdown', onPointerDown, true);
      node.removeEventListener('click', onClick, true);
    }
  };
}
