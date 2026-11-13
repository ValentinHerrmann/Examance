/** Pointer routing of the grading viewer (issue #233): which pointer draws, which ones pan and pinch, and how stale pointers are cleared, kept free of DOM so it can be unit-tested. */

export type Point = { x: number; y: number };

const PEN_SEEN_KEY = 'grading_pen_seen';

/** Pen and mouse always draw; a finger draws only until this device has shown a pen (palm rejection, like note-taking apps). */
export function drawsWith(pointerType: string, penSeen: boolean): boolean {
  if (pointerType === 'pen' || pointerType === 'mouse') return true;
  return !penSeen;
}

/** Whether this device has shown a pen before; storage may be unavailable (private window), so it never throws. */
export function readPenSeen(): boolean {
  try {
    return localStorage.getItem(PEN_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberPenSeen(): void {
  try {
    localStorage.setItem(PEN_SEEN_KEY, '1');
  } catch {
    // Per-device convenience only: without storage the pen is detected again next time.
  }
}

/** What a pointerdown starts. */
export type DownAction =
  | { kind: 'draw' }
  /** A second finger joined a finger that was drawing: stop that stroke and pinch with both. */
  | { kind: 'pinch-from-draw'; a: Point; b: Point }
  | { kind: 'pinch'; a: Point; b: Point }
  | { kind: 'pan' }
  | { kind: 'ignore' };

export interface PointerSample {
  pointerId: number;
  pointerType: string;
  x: number;
  y: number;
  /** `PointerEvent.button` (0 = primary). */
  button?: number;
}

/** One drawing pointer plus the navigation pointers (fingers that pan or pinch). A touch never joins or ends the pen's stroke, and every pointer is removed by id only. */
export class PointerRouter {
  private drawId: number | null = null;
  private drawType = '';
  private drawLast: Point = { x: 0, y: 0 };
  private readonly nav = new Map<number, Point>();
  private lastPan: Point | null = null;

  constructor(public penSeen = false) {}

  get drawing(): boolean {
    return this.drawId !== null;
  }

  get navCount(): number {
    return this.nav.size;
  }

  isDrawPointer(id: number): boolean {
    return this.drawId === id;
  }

  down(e: PointerSample): DownAction {
    if (e.pointerType === 'pen') this.penSeen = true;
    if (e.pointerType === 'mouse' && (e.button ?? 0) !== 0) return { kind: 'ignore' };
    const p = { x: e.x, y: e.y };

    if (drawsWith(e.pointerType, this.penSeen)) {
      if (this.drawId === e.pointerId) return { kind: 'ignore' };
      // A finger joining a drawing finger is a pinch (phones without a pen).
      if (this.drawId !== null && e.pointerType === 'touch' && this.drawType === 'touch') {
        const first = this.drawLast;
        this.nav.set(this.drawId, first);
        this.nav.set(e.pointerId, p);
        this.drawId = null;
        this.lastPan = null;
        return { kind: 'pinch-from-draw', a: first, b: p };
      }
      if (this.nav.size >= 2) return { kind: 'ignore' };
      // Any other drawer replaces one whose up event never arrived (stale pointer).
      this.drawId = e.pointerId;
      this.drawType = e.pointerType;
      this.drawLast = p;
      return { kind: 'draw' };
    }

    // Navigation finger (a pen has been seen): never touches the drawing pointer.
    if (this.nav.size >= 2) return { kind: 'ignore' };
    this.nav.set(e.pointerId, p);
    if (this.nav.size === 2) {
      const [a, b] = this.nav.values();
      this.lastPan = null;
      return { kind: 'pinch', a, b };
    }
    this.lastPan = p;
    return { kind: 'pan' };
  }

  /** Moves a navigation pointer; answers the pinch points, or the pan delta of a single finger, or null. */
  moveNav(e: PointerSample): { pinch: [Point, Point] } | { pan: Point } | null {
    if (!this.nav.has(e.pointerId)) return null;
    const p = { x: e.x, y: e.y };
    this.nav.set(e.pointerId, p);
    if (this.nav.size === 2) {
      const [a, b] = this.nav.values();
      return { pinch: [a, b] };
    }
    if (!this.lastPan) {
      this.lastPan = p;
      return null;
    }
    const delta = { x: this.lastPan.x - p.x, y: this.lastPan.y - p.y };
    this.lastPan = p;
    return { pan: delta };
  }

  moveDraw(e: PointerSample): void {
    if (this.drawId === e.pointerId) this.drawLast = { x: e.x, y: e.y };
  }

  /** Ends one pointer (up, cancel, lost capture); answers whether it was the drawing one and whether a pinch ended. Idempotent. */
  up(pointerId: number): { endedDraw: boolean; endedPinch: boolean } {
    const endedDraw = this.drawId === pointerId;
    if (endedDraw) this.drawId = null;
    const wasPinch = this.nav.size === 2;
    const removed = this.nav.delete(pointerId);
    // The finger left after a pinch pans afresh from its next move.
    this.lastPan = null;
    return { endedDraw, endedPinch: removed && wasPinch };
  }

  /** Forgets every pointer (window blur, tab hidden): no pointer may stay stuck in a pinch. */
  reset(): { endedDraw: boolean } {
    const endedDraw = this.drawId !== null;
    this.drawId = null;
    this.nav.clear();
    this.lastPan = null;
    return { endedDraw };
  }
}
