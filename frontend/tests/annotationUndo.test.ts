import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { AnnotationUndo } from '../src/lib/components/grading/annotationUndo';
import { gradingStore, type VectorStroke } from '../src/lib/grading/gradingStore';

const stamp = (x: number): VectorStroke => ({ tool: 'check_full', points: [{ x, y: 0 }], color: '#ef4444', pageNumber: 1 });

describe('AnnotationUndo (issue #330)', () => {
  it('forgets the previous student once the next one starts loading', () => {
    let strokes: VectorStroke[] = [stamp(1)];
    const apply = vi.fn((next: VectorStroke[]) => (strokes = next));
    const undoer = new AnnotationUndo({ strokes: () => strokes, apply, discard: () => {}, notice: () => undefined, redraw: () => {} });
    undoer.checkpoint([]);
    expect(get(gradingStore).canUndo).toBe(true);

    // The viewer resets when a load starts, before the new student's annotations arrive.
    undoer.reset();
    strokes = [];
    undoer.undo();
    expect(apply).not.toHaveBeenCalled();
    expect(get(gradingStore).canUndo).toBe(false);
  });
});
