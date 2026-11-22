/** Pen, finger and mouse input of the grading viewer (issue #233): strokes, stamps, erasing, finger pan and pinch. Split out of ScanCanvasViewer.svelte; the component owns canvases, redraws and the store. */

import { get } from 'svelte/store';
import { gradingStore, type VectorStroke } from '#lib/grading/gradingStore';
import { eraseStrokesAt, isScratchOut, newStroke, scratchOutStrokes } from './ScanCanvasViewer';
import { PointerRouter, type Point, type PointerSample } from './pointerInput';
import { markPenSeen } from '#lib/stores/penInput';
import { releaseTextFocus } from './palmGuard';

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
  /** One gesture changed the strokes: `before` is the undo snapshot (one history entry per gesture). */
  checkpoint(before: VectorStroke[]): void;
  /** A scribble erased `removed` (issue #330). */
  onScratchOut(removed: VectorStroke[], scribble: VectorStroke): void;
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
  // The eraser's previous point, so a fast move erases along its whole path, not just where move events land.
  private eraserAt: Point | null = null;
  private page = 1;
  // The stamp the first finger placed and when, so a second finger right after (pinch) can take it back.
  private stampIndex: number | null = null;
  private startedAt = 0;
  // Strokes when the gesture started, for its single undo entry.
  private before: VectorStroke[] | null = null;
  // Scribbling over marks erases them (issue #330, account setting).
  private scratchOut = true;
  /** Pen or line stroke in progress: committed to the store only when the pointer lifts, so a move never notifies every grading subscriber and autosave never sees half a stroke. */
  live: VectorStroke | null = null;

  constructor(private readonly view: StrokeInputView) {}

  /** Follows `penSeenStore` (a reset in Settings lets fingers draw again). */
  setPenSeen(seen: boolean) {
    this.pointers.penSeen = seen;
  }

  /** Follows the account's scratch-out switch (Settings → Pen input). */
  setScratchOut(on: boolean) {
    this.scratchOut = on;
  }

  down = (e: PointerEvent) => {
    const action = this.pointers.down(sample(e));
    if (e.pointerType === 'pen' && markPenSeen()) this.view.onPenDetected();
    if (action.kind === 'ignore') return;
    // Drawing on the scan never moves focus on iOS (its touches are cancelled), so a score field would keep the keyboard over the scan.
    releaseTextFocus();
    switch (action.kind) {
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
        if (action.endedPinch) this.view.zoom.pinchEnd();
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
    if ('pinchStart' in nav) this.view.zoom.pinchStart(nav.pinchStart[0], nav.pinchStart[1]);
    else if ('pinch' in nav) this.view.zoom.pinchMove(nav.pinch[0], nav.pinch[1]);
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

  /** Commits the stroke in progress to the store (one update per stroke) and ends the gesture. */
  finish() {
    this.erasing = false;
    this.eraserAt = null;
    const live = this.live;
    this.live = null;
    const removed = live ? this.commitLive(live) : [];
    this.endGesture();
    if (live && removed.length > 0) this.view.onScratchOut(removed, live);
  }

  /** Appends a finished pen or line stroke, or lets a scribble erase what it covers; answers the marks it erased. */
  private commitLive(live: VectorStroke): VectorStroke[] {
    const page = live.pageNumber ?? this.page;
    const strokes = this.view.strokes();
    // A scribble is never kept as ink, also when it covers nothing: scribbling over student work is not allowed.
    if (live.tool === 'pen' && this.scratchOut && isScratchOut(live.points)) {
      const remaining = scratchOutStrokes(strokes, page, live.points);
      if (remaining) {
        this.view.persist(remaining);
        this.view.recalcScores();
        gradingStore.markDirty();
      }
      this.view.redraw(page);
      return remaining ? strokes.filter((st) => !remaining.includes(st)) : [];
    }
    this.view.persist([...strokes, live]);
    gradingStore.markDirty();
    this.view.redraw(page);
    return [];
  }

  private endGesture() {
    const before = this.before;
    this.before = null;
    const now = this.view.strokes();
    // By element: a stamp a pinch took back leaves a new array with the same strokes, which is no edit.
    if (before && (now.length !== before.length || now.some((st, i) => st !== before[i]))) this.view.checkpoint(before);
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
    this.before = this.view.strokes();

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

  private eraseAt(point: Point) {
    const from = this.eraserAt ?? point;
    this.eraserAt = point;
    const remaining = eraseStrokesAt(this.view.strokes(), this.page, from, point);
    if (!remaining) return;
    this.view.persist(remaining);
    this.view.recalcScores();
    gradingStore.markDirty();
    this.view.redraw(this.page);
  }

  /** A second finger turned the first finger's drawing into a pinch: take back what it placed in the first 300 ms, keep a longer stroke. */
  private abortForPinch() {
    this.erasing = false;
    this.eraserAt = null;
    const live = this.live;
    this.live = null;
    const accidental = performance.now() - this.startedAt < ACCIDENTAL_MS;
    const strokes = this.view.strokes();
    let removed: VectorStroke[] = [];
    if (live && !accidental) {
      removed = this.commitLive(live);
    } else if (!live && accidental && this.stampIndex !== null && this.stampIndex < strokes.length) {
      const index = this.stampIndex;
      this.view.persist(strokes.filter((_, i) => i !== index));
      this.view.recalcScores();
    }
    this.stampIndex = null;
    this.view.redraw(this.page);
    this.endGesture();
    if (live && removed.length > 0) this.view.onScratchOut(removed, live);
  }
}
