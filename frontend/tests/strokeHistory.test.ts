import { describe, expect, it } from 'vitest';
import { StrokeHistory } from '../src/lib/grading/strokeHistory';
import type { VectorStroke } from '../src/lib/grading/gradingStore';

const stamp = (x: number): VectorStroke => ({ tool: 'check_full', points: [{ x, y: 0 }], color: '#ef4444', pageNumber: 1 });

describe('StrokeHistory (issue #330)', () => {
  it('steps back and forward through the recorded edits', () => {
    const h = new StrokeHistory();
    const a: VectorStroke[] = [];
    const b = [stamp(1)];
    const c = [stamp(1), stamp(2)];
    h.record(a);
    h.record(b);
    expect(h.undo(c)).toBe(b);
    expect(h.undo(b)).toBe(a);
    expect(h.undo(a)).toBeNull();
    expect(h.redo(a)).toBe(b);
    expect(h.redo(b)).toBe(c);
    expect(h.canRedo).toBe(false);
  });

  it('drops the redo steps when a new edit follows an undo', () => {
    const h = new StrokeHistory();
    h.record([]);
    h.undo([stamp(1)]);
    expect(h.canRedo).toBe(true);
    h.record([]);
    expect(h.canRedo).toBe(false);
    expect(h.redo([stamp(3)])).toBeNull();
  });

  it('keeps the last 100 edits and forgets everything on clear', () => {
    const h = new StrokeHistory();
    for (let i = 0; i < 105; i++) h.record([stamp(i)]);
    let steps = 0;
    let current: VectorStroke[] = [];
    for (let next = h.undo(current); next; next = h.undo(current)) {
      current = next;
      steps++;
    }
    expect(steps).toBe(100);
    expect(current[0].points[0].x).toBe(5);
    h.record([]);
    h.clear();
    expect(h.canUndo || h.canRedo).toBe(false);
  });
});
