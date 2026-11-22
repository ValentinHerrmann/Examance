/** Undo/redo, the floating notice and the scratch-out glow of the grading viewer (issues #233, #330); split out of ScanCanvasViewer.svelte. */

import { gradingStore, type VectorStroke } from '#lib/grading/gradingStore';
import { StrokeHistory } from '#lib/grading/strokeHistory';
import { translate } from '#lib/i18n';
import { drawGlow } from '#lib/grading/strokeRenderer';
import { cssVar } from '#lib/utils/cssVar';
import { penInputSettingsHref } from '#lib/utils/links';
import type { Notice } from './CanvasNotice.svelte';

export interface AnnotationUndoView {
  strokes(): VectorStroke[];
  /** Shows `next` as the annotation layer: persist, recount auto scores, redraw, mark dirty. */
  apply(next: VectorStroke[]): void;
  /** Ends the gesture in progress (an eraser drag may still record its entry). */
  discard(): void;
  notice(): { show(n: Notice): void; hide(): void } | undefined;
  redraw(page: number): void;
}

const GLOW_MS = 500;

export class AnnotationUndo {
  private readonly history = new StrokeHistory();
  // The notice offers Undo until the next edit or student.
  private undoOffered = false;
  // Marks a scribble just erased, still drawn glowing so a mistake is noticed.
  private glow: { strokes: VectorStroke[]; page: number } | null = null;
  private glowTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly view: AnnotationUndoView) {}

  /** One gesture changed the strokes; `before` is what Undo returns to. */
  checkpoint = (before: VectorStroke[]) => {
    this.history.record(before);
    this.withdraw();
    this.publish();
  };

  undo = () => {
    this.view.discard();
    this.step(this.history.undo(this.view.strokes()));
  };

  redo = () => {
    this.view.discard();
    this.step(this.history.redo(this.view.strokes()));
  };

  /** A scribble erased `removed`: they and the scribble glow for half a second, and the notice offers Undo. */
  scratchedOut(removed: VectorStroke[], scribble: VectorStroke) {
    this.offerUndo(translate('grading.canvas.scratchedOut', { count: removed.length }));
    this.endGlow();
    const page = scribble.pageNumber ?? 1;
    this.glow = { strokes: [...removed, scribble], page };
    this.view.redraw(page);
    this.glowTimer = setTimeout(() => this.endGlow(), GLOW_MS);
  }

  /** Called by the overlay redraw of `page`, after the normal strokes. */
  drawGlow(ctx: CanvasRenderingContext2D, page: number) {
    if (this.glow?.page === page) drawGlow(ctx, this.glow.strokes, page, cssVar('--color-warning', '#f59e0b'));
  }

  endGlow() {
    clearTimeout(this.glowTimer);
    const page = this.glow?.page;
    this.glow = null;
    if (page !== undefined) this.view.redraw(page);
  }

  /** A new submission's annotations: its history starts empty. */
  reset() {
    this.endGlow();
    this.history.clear();
    this.withdraw();
    this.publish();
  }

  offerUndo(message: string) {
    this.undoOffered = true;
    this.view.notice()?.show({ message, action: { label: translate('grading.canvas.undo'), onClick: this.undo } });
  }

  /** Told once, when this device shows its first pen: fingers stop drawing. */
  penDetected = () => {
    this.undoOffered = false;
    const link = { href: penInputSettingsHref, label: translate('grading.canvas.penDetectedReset') };
    this.view.notice()?.show({ message: translate('grading.canvas.penDetected'), link, timeoutMs: 8000 });
  };

  private step(next: VectorStroke[] | null) {
    if (!next) return;
    this.endGlow();
    this.withdraw();
    this.view.apply(next);
    this.publish();
  }

  private withdraw() {
    if (this.undoOffered) this.view.notice()?.hide();
    this.undoOffered = false;
  }

  private publish() {
    gradingStore.setUndoState(this.history.canUndo, this.history.canRedo);
  }
}
