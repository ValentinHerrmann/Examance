/** Undo/redo of the annotation layer of the loaded submission (issue #330): whole-array snapshots, one per gesture. */

import type { VectorStroke } from './gradingStore';

const LIMIT = 100;

export class StrokeHistory {
  private past: VectorStroke[][] = [];
  private future: VectorStroke[][] = [];

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Remembers the strokes as they were before an edit; a new edit drops what could be redone. */
  record(before: VectorStroke[]): void {
    this.past.push(before);
    if (this.past.length > LIMIT) this.past.shift();
    this.future = [];
  }

  /** The strokes to show after undoing, given the current ones; null when there is nothing to undo. */
  undo(current: VectorStroke[]): VectorStroke[] | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(current);
    return prev;
  }

  /** The strokes to show after redoing; null when there is nothing to redo. */
  redo(current: VectorStroke[]): VectorStroke[] | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(current);
    return next;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
