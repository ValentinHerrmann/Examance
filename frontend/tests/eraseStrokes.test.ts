import { describe, expect, it } from 'vitest';
import { eraseStrokesAt, segmentDistance } from '../src/lib/components/grading/ScanCanvasViewer';
import type { VectorStroke } from '../src/lib/grading/gradingStore';

const line: VectorStroke = { tool: 'line', points: [{ x: 0, y: 100 }, { x: 400, y: 100 }], color: '#000', pageNumber: 1 };
const stamp: VectorStroke = { tool: 'check_full', points: [{ x: 50, y: 50 }], color: '#ef4444', pageNumber: 1 };

describe('eraseStrokesAt (issue #327)', () => {
  it('erases a straight line touched in its middle', () => {
    expect(eraseStrokesAt([line], 1, { x: 200, y: 110 })).toEqual([]);
  });

  it('keeps a line the eraser stays clear of', () => {
    expect(eraseStrokesAt([line], 1, { x: 200, y: 140 })).toBeNull();
  });

  it('still erases a stamp by its point and leaves other pages alone', () => {
    const other = { ...line, pageNumber: 2 };
    expect(eraseStrokesAt([stamp, other], 1, { x: 60, y: 55 })).toEqual([other]);
    expect(eraseStrokesAt([other], 1, { x: 200, y: 100 })).toBeNull();
  });

  it('erases a sparse pen stroke between its samples', () => {
    const pen: VectorStroke = { tool: 'pen', points: [{ x: 0, y: 0 }, { x: 300, y: 300 }], color: '#000', pageNumber: 1 };
    expect(eraseStrokesAt([pen], 1, { x: 150, y: 150 })).toEqual([]);
  });

  it('erases a line a fast sweep crossed between two move events', () => {
    expect(eraseStrokesAt([line], 1, { x: 200, y: 0 }, { x: 200, y: 200 })).toEqual([]);
    expect(eraseStrokesAt([line], 1, { x: 200, y: 0 })).toBeNull();
  });
});

describe('segmentDistance', () => {
  it('is 0 for crossing segments and the gap for parallel ones', () => {
    expect(segmentDistance({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(0);
    expect(segmentDistance({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(5);
  });
});
