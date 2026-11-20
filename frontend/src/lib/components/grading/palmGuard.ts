/** Palm rejection outside the scan (issue #321): while a pen writes, and briefly after, a finger or palm touching the grading page never taps, focuses or selects anything. The scan stack routes its own touches (`pointerInput.ts`). */

/** How long after the pen lifts a touch still counts as the resting palm. */
export const PALM_GRACE_MS = 500;
/** A pen contact with no pen event for this long lost its up event and no longer blocks. */
export const PEN_STALE_MS = 5000;
/** How long after a blocked touch its click is still swallowed (browsers fire click on release). */
const CLICK_WINDOW_MS = 700;
/** Elements marked with this attribute (the scan stack) handle their own touches. */
export const PALM_GUARD_SKIP = 'data-palm-guard-skip';

const TEXT_FIELDS = 'input, textarea, [contenteditable]';

/** Pen contact timing, free of DOM so it can be unit-tested; times come from `performance.now()` (event time stamps of touch and pointer events may differ in base). */
export class PalmGuard {
  /** Pen pointer id → time of its last event. */
  private readonly pens = new Map<number, number>();
  private lastPenUp = Number.NEGATIVE_INFINITY;

  penDown(pointerId: number, now: number): void {
    this.pens.set(pointerId, now);
  }

  /** A pen moving with no button pressed (hovering) lost its up event. */
  penMove(pointerId: number, now: number, buttons: number): void {
    if (!this.pens.has(pointerId)) return;
    if (buttons === 0) this.penUp(pointerId, now);
    else this.pens.set(pointerId, now);
  }

  penUp(pointerId: number, now: number): void {
    if (this.pens.delete(pointerId)) this.lastPenUp = now;
  }

  blocksTouch(now: number): boolean {
    for (const [id, at] of this.pens) {
      if (now - at < PEN_STALE_MS) continue;
      this.pens.delete(id);
      this.lastPenUp = Math.max(this.lastPenUp, at);
    }
    return this.pens.size > 0 || now - this.lastPenUp < PALM_GRACE_MS;
  }

  /** Forgets pens whose up event never arrived (window blur, hidden tab). */
  reset(now: number): void {
    if (this.pens.size > 0) this.lastPenUp = now;
    this.pens.clear();
  }
}

function skipped(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${PALM_GUARD_SKIP}]`) !== null;
}

function editable(target: EventTarget | null): boolean {
  // A selection's target can be a text node.
  let el: Element | null = null;
  if (target instanceof Element) el = target;
  else if (target instanceof Node) el = target.parentElement;
  return el?.closest(TEXT_FIELDS) != null;
}

/** Blurs a focused text field, so the on-screen keyboard closes when drawing starts on the scan. */
export function releaseTextFocus(): void {
  const active = typeof document === 'undefined' ? null : document.activeElement;
  if (active instanceof HTMLElement && active.matches(TEXT_FIELDS)) active.blur();
}

/** For the scan stack: it handles every touch through pointer events, so Safari must never start a Pencil selection, Scribble or loupe gesture there (that cancels the stroke, issue #321). Never make these listeners passive. */
export function ownTouches(node: HTMLElement) {
  const cancel = (e: TouchEvent) => {
    if (e.cancelable) e.preventDefault();
  };
  node.addEventListener('touchstart', cancel, { capture: true, passive: false });
  node.addEventListener('touchmove', cancel, { capture: true, passive: false });
  return {
    destroy() {
      node.removeEventListener('touchstart', cancel, true);
      node.removeEventListener('touchmove', cancel, true);
    }
  };
}

/** Svelte action for the grade page root; `enabled` follows `penSeenStore`, so devices without a pen keep every tap. */
export function palmGuard(node: HTMLElement, enabled: boolean) {
  let on = enabled;
  const guard = new PalmGuard();
  let blocked: { pointerId: number; at: number } | null = null;

  const onPenDown = (e: PointerEvent) => {
    if (e.pointerType === 'pen') guard.penDown(e.pointerId, performance.now());
  };
  const onPenMove = (e: PointerEvent) => {
    if (e.pointerType === 'pen') guard.penMove(e.pointerId, performance.now(), e.buttons);
  };
  const onPenUp = (e: PointerEvent) => {
    if (e.pointerType === 'pen') guard.penUp(e.pointerId, performance.now());
  };
  const onBlur = () => guard.reset(performance.now());
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') guard.reset(performance.now());
  };
  // Anywhere on the page (navbar and footer included), also before `enabled`: a pen contact already proves a pen; a double-tap of two quick ticks selects after the pen lifted.
  const onSelectStart = (e: Event) => {
    if (guard.blocksTouch(performance.now()) && !editable(e.target)) e.preventDefault();
  };

  // iOS Safari: cancelling the touch stops its focus, click and text selection; the Pencil's own touches (`touchType` stylus) pass.
  const onTouchStart = (e: TouchEvent) => {
    if (!on || skipped(e.target) || !guard.blocksTouch(performance.now())) return;
    const stylus = Array.from(e.changedTouches).some((t) => (t as Touch & { touchType?: string }).touchType === 'stylus');
    if (!stylus && e.cancelable) e.preventDefault();
  };
  // Other browsers: remember the blocked touch and swallow the click it produces.
  const onPointerDown = (e: PointerEvent) => {
    if (on && e.pointerType === 'touch' && !skipped(e.target) && guard.blocksTouch(performance.now())) {
      blocked = { pointerId: e.pointerId, at: performance.now() };
    }
  };
  const onClick = (e: MouseEvent) => {
    if (!on || !blocked || performance.now() - blocked.at > CLICK_WINDOW_MS) return;
    // A click that names its pointer must come from the blocked touch: a pen, mouse or keyboard click right after a palm still goes through.
    if (typeof PointerEvent !== 'undefined' && e instanceof PointerEvent) {
      if (e.pointerType !== 'touch' || e.pointerId !== blocked.pointerId) return;
    }
    blocked = null;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  window.addEventListener('pointerdown', onPenDown, true);
  window.addEventListener('pointermove', onPenMove, true);
  window.addEventListener('pointerup', onPenUp, true);
  window.addEventListener('pointercancel', onPenUp, true);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('selectstart', onSelectStart, true);
  node.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
  node.addEventListener('pointerdown', onPointerDown, true);
  node.addEventListener('click', onClick, true);

  return {
    update(next: boolean) {
      on = next;
    },
    destroy() {
      window.removeEventListener('pointerdown', onPenDown, true);
      window.removeEventListener('pointermove', onPenMove, true);
      window.removeEventListener('pointerup', onPenUp, true);
      window.removeEventListener('pointercancel', onPenUp, true);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('selectstart', onSelectStart, true);
      node.removeEventListener('touchstart', onTouchStart, true);
      node.removeEventListener('pointerdown', onPointerDown, true);
      node.removeEventListener('click', onClick, true);
    }
  };
}
