/** Pen, finger and mouse input of the grading viewer (issue #233): strokes, stamps, erasing, finger pan and pinch. Split out of ScanCanvasViewer.svelte; the component owns canvases, redraws and the store. */

import { get } from 'svelte/store';
import { gradingStore, type VectorStroke } from '#lib/grading/gradingStore';
import { eraseStrokesAt, newStroke } from './ScanCanvasViewer';
import { PointerRouter, type Point, type PointerSample } from './pointerInput';
import { markPenSeen } from '#lib/stores/penInput';

type ClientPoint = { clientX: number; clientY: number };

export interface StrokeInputView {
  strokes(): VectorStroke[];
  /** Replaces the strokes in the store (one update). */
  persist(next: VectorStroke[]): void;
  recalcScores(): void;
  exercises(): { id: string }[];
  pageFromEvent(e: PointerEvent): number | null;
  /** Client → canvas pixels of `page`, measured once per call. */
  mapper(page: number): ((e: ClientPoint) => Point) | null;
  /** Redraws `page` in the next frame; null only draws the live stroke's new points. */
  redraw(page: number | null): void;
  zoom: { pinchStart(a: Point, b: Point): void; pinchMove(a: Point, b: Point): boolean; pinchEnd(): void };
  scrollBy(dx: number, dy: number): void;
  /** The first pen on this device: from now on fingers only scroll and zoom. */
  onPenDetected(): void;
}

const ACCIDENTAL_MS = 300;

function sample(e: PointerEvent): PointerSample {
  return { pointerId: e.pointerId, pointerType: e.pointerType, x: e.clientX, y: e.clientY, button: e.button };
}

/** Keeps up, cancel and moves on this element even when the pointer leaves it, so no pointer is left behind as "still down". */
function capture(e: PointerEvent) {
  try {
    (e.currentTarget as Element | null)?.setPointerCapture?.(e.pointerId);
  } catch {
    // The pointer is already gone (e.g. cancelled); its up/cancel event cleans up.
  }
}

export class StrokeInput {
  private readonly pointers = new PointerRouter();
  private erasing = false;
  private page = 1;
  // The stamp the first finger placed and when, so a second finger right after (pinch) can take it back.
  private stampIndex: number | null = null;
  private startedAt = 0;
  /** Pen or line stroke in progress: committed to the store only when the pointer lifts, so a move never notifies every grading subscriber and autosave never sees half a stroke. */
  live: VectorStroke | null = null;

  constructor(private readonly view: StrokeInputView) {}

  /** Follows `penSeenStore` (a reset in Settings lets fingers draw again). */
  setPenSeen(seen: boolean) {
    this.pointers.penSeen = seen;
  }

  down = (e: PointerEvent) => {
    const action = this.pointers.down(sample(e));
    if (e.pointerType === 'pen' && markPenSeen()) this.view.onPenDetected();
    switch (action.kind) {
      case 'ignore':
        return;
      case 'pan':
        capture(e);
        return;
      case 'pinch':
        capture(e);
        this.view.zoom.pinchStart(action.a, action.b);
        return;
      case 'pinch-from-draw':
        capture(e);
        this.abortForPinch();
        this.view.zoom.pinchStart(action.a, action.b);
        return;
      case 'draw':
        this.startDraw(e);
    }
  };

  move = (e: PointerEvent) => {
    if (this.pointers.isDrawPointer(e.pointerId)) {
      // A pen or mouse with no button pressed lost its up event: end the stroke instead of drawing while hovering.
      if (e.buttons === 0 && e.pointerType !== 'touch') {
        this.end(e);
        return;
      }
      this.pointers.moveDraw(sample(e));
      this.drawMove(e);
      return;
    }
    const nav = this.pointers.moveNav(sample(e));
    if (!nav) return;
    if ('pinch' in nav) this.view.zoom.pinchMove(nav.pinch[0], nav.pinch[1]);
    else this.view.scrollBy(nav.pan.x, nav.pan.y);
  };

  /** Up, cancel and lost capture of one pointer; idempotent, as lost capture follows every up. */
  end = (e: PointerEvent) => {
    const { endedDraw, endedPinch } = this.pointers.up(e.pointerId);
    if (endedPinch) this.view.zoom.pinchEnd();
    if (endedDraw) this.finish();
  };

  /** Forgets every pointer (window blur, hidden tab), so none stays stuck as a pinch. */
  reset = () => {
    this.pointers.reset();
    this.view.zoom.pinchEnd();
    this.finish();
  };

  /** Drops the stroke in progress without committing it (a new student loads). */
  discard() {
    this.live = null;
    this.reset();
  }

  /** Commits the stroke in progress to the store (one update per stroke). */
  finish() {
    this.erasing = false;
    const live = this.live;
    if (!live) return;
    this.live = null;
    this.view.persist([...this.view.strokes(), live]);
    gradingStore.markDirty();
    this.view.redraw(live.pageNumber ?? this.page);
  }

  private startDraw(e: PointerEvent) {
    // A new drawing pointer ends a stroke whose up event never arrived.
    this.finish();
    const page = this.view.pageFromEvent(e);
    const point = page === null ? null : this.view.mapper(page)?.(e);
    if (page === null || !point) {
      this.pointers.up(e.pointerId);
      return;
    }
    capture(e);
    this.page = page;
    this.stampIndex = null;
    this.startedAt = performance.now();

    const state = get(gradingStore);
    if (state.drawTool === 'eraser') {
      this.erasing = true;
      this.eraseAt(point);
      return;
    }
    const stroke = newStroke(state, this.view.exercises(), point, page);
    if (stroke.tool === 'pen' || stroke.tool === 'line') {
      this.live = stroke;
      this.view.redraw(null);
      return;
    }
    // A stamp is complete on touch.
    const strokes = this.view.strokes();
    this.stampIndex = strokes.length;
    this.view.persist([...strokes, stroke]);
    gradingStore.markDirty();
    this.view.recalcScores();
    this.view.redraw(page);
  }

  private drawMove(e: PointerEvent) {
    const toCanvas = this.view.mapper(this.page);
    if (!toCanvas) return;
    if (this.erasing) {
      this.eraseAt(toCanvas(e));
      return;
    }
    const live = this.live;
    if (!live) return;
    if (live.tool === 'line') {
      live.points[1] = toCanvas(e);
      this.view.redraw(this.page);
      return;
    }
    // Coalesced events carry the samples the browser merged into this one: fast pen strokes stay smooth.
    const coalesced = e.getCoalescedEvents?.() ?? [];
    for (const ev of coalesced.length > 0 ? coalesced : [e]) live.points.push(toCanvas(ev));
    this.view.redraw(null);
  }

  private eraseAt({ x, y }: Point) {
    const remaining = eraseStrokesAt(this.view.strokes(), this.page, x, y);
    if (!remaining) return;
    this.view.persist(remaining);
    this.view.recalcScores();
    gradingStore.markDirty();
    this.view.redraw(this.page);
  }

  /** A second finger turned the first finger's drawing into a pinch: take back what it placed in the first 300 ms, keep a longer stroke. */
  private abortForPinch() {
    this.erasing = false;
    const live = this.live;
    this.live = null;
    const accidental = performance.now() - this.startedAt < ACCIDENTAL_MS;
    const strokes = this.view.strokes();
    if (live && !accidental) {
      this.view.persist([...strokes, live]);
      gradingStore.markDirty();
    } else if (!live && accidental && this.stampIndex !== null && this.stampIndex < strokes.length) {
      const index = this.stampIndex;
      this.view.persist(strokes.filter((_, i) => i !== index));
      this.view.recalcScores();
    }
    this.stampIndex = null;
    this.view.redraw(this.page);
  }
}
