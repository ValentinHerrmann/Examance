/** Undo/redo and the floating notice of the grading viewer (issues #233, #330); split out of ScanCanvasViewer.svelte. */

import { gradingStore, type VectorStroke } from '#lib/grading/gradingStore';
import { StrokeHistory } from '#lib/grading/strokeHistory';
import { translate } from '#lib/i18n';
import { penInputSettingsHref } from '#lib/utils/links';
import type { Notice } from './CanvasNotice.svelte';

export interface AnnotationUndoView {
  strokes(): VectorStroke[];
  /** Shows `next` as the annotation layer: persist, recount auto scores, redraw, mark dirty. */
  apply(next: VectorStroke[]): void;
  /** Ends the gesture in progress (an eraser drag may still record its entry). */
  discard(): void;
  notice(): { show(n: Notice): void; hide(): void } | undefined;
}

export class AnnotationUndo {
  private readonly history = new StrokeHistory();
  // The notice offers Undo until the next edit or student.
  private undoOffered = false;

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

  /** A new submission's annotations: its history starts empty. */
  reset() {
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
