/** Tells a tap or click from a pan, pinch or scroll on a PDF preview (issue #347): one primary pointer that moved less than `TAP_SLOP_PX` and lifted within `TAP_MS`. */
export const TAP_SLOP_PX = 6;
export const TAP_MS = 300;

interface Down {
  x: number;
  y: number;
  at: number;
}

export interface TapTracker {
  down(e: Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY' | 'button' | 'isPrimary' | 'timeStamp'>): void;
  /** True when this pointer-up completes a tap. */
  up(e: Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY' | 'timeStamp'>): boolean;
  cancel(e: Pick<PointerEvent, 'pointerId'>): void;
  /** Whether the pointer has moved past the tap slop since it went down. */
  moved(e: Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY'>): boolean;
}

export function createTapTracker(): TapTracker {
  const downs = new Map<number, Down>();
  // A second finger makes the gesture a pinch: nothing in it counts as a tap.
  let spoiled = false;
  return {
    down(e) {
      if (downs.size > 0) spoiled = true;
      else spoiled = !e.isPrimary || e.button !== 0;
      downs.set(e.pointerId, { x: e.clientX, y: e.clientY, at: e.timeStamp });
    },
    up(e) {
      const d = downs.get(e.pointerId);
      downs.delete(e.pointerId);
      if (!d || spoiled) {
        if (downs.size === 0) spoiled = false;
        return false;
      }
      return Math.hypot(e.clientX - d.x, e.clientY - d.y) < TAP_SLOP_PX && e.timeStamp - d.at <= TAP_MS;
    },
    cancel(e) {
      downs.delete(e.pointerId);
      if (downs.size === 0) spoiled = false;
    },
    moved(e) {
      const d = downs.get(e.pointerId);
      return !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) >= TAP_SLOP_PX;
    },
  };
}
