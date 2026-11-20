import { describe, expect, it } from 'vitest';
import { isScratchOut, scratchOutStrokes } from '../src/lib/components/grading/ScanCanvasViewer';
import type { VectorStroke } from '../src/lib/grading/gradingStore';

type Point = { x: number; y: number };

/** Dense samples along a polyline, like the pointer events of one pen stroke. */
function polyline(corners: Point[], step = 4): Point[] {
  const out: Point[] = [corners[0]];
  for (let i = 1; i < corners.length; i++) {
    const a = corners[i - 1];
    const b = corners[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

/** A back-and-forth scribble over x 100..300, drifting down from y 100. */
function zigzag(passes: number, drift = 10): Point[] {
  return polyline(Array.from({ length: passes + 1 }, (_, i) => ({ x: i % 2 === 0 ? 100 : 300, y: 100 + i * drift })));
}

function circle(laps: number, r = 60): Point[] {
  return Array.from({ length: laps * 90 + 1 }, (_, i) => ({ x: 200 + r * Math.cos((i * Math.PI) / 45), y: 200 + r * Math.sin((i * Math.PI) / 45) }));
}

describe('isScratchOut (issue #330)', () => {
  it('recognises a back-and-forth scribble, also over a square area', () => {
    expect(isScratchOut(zigzag(6))).toBe(true);
    expect(isScratchOut(zigzag(7, 30))).toBe(true);
  });

  it('ignores a straight line, a tick, a dot and too few passes', () => {
    expect(isScratchOut(polyline([{ x: 0, y: 0 }, { x: 300, y: 10 }]))).toBe(false);
    expect(isScratchOut(polyline([{ x: 0, y: 30 }, { x: 15, y: 50 }, { x: 60, y: 0 }]))).toBe(false);
    expect(isScratchOut([{ x: 5, y: 5 }])).toBe(false);
    expect(isScratchOut(zigzag(3))).toBe(false);
  });

  it('ignores circles, written letters and a wavy underline', () => {
    expect(isScratchOut(circle(3))).toBe(false);
    expect(isScratchOut(polyline([{ x: 0, y: 0 }, { x: 30, y: 100 }, { x: 60, y: 0 }, { x: 90, y: 100 }, { x: 120, y: 0 }]))).toBe(false);
    const w = polyline([0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [{ x: i * 30, y: 0 }, { x: i * 30 + 15, y: 100 }]));
    expect(isScratchOut(w)).toBe(false);
    const wave = Array.from({ length: 200 }, (_, i) => ({ x: i * 2, y: 100 + 10 * Math.sin(i / 5) }));
    expect(isScratchOut(wave)).toBe(false);
  });

  it('survives a few pixels of pen jitter', () => {
    const jittery = zigzag(6).map((p, i) => ({ x: p.x + (i % 3) - 1, y: p.y + ((i * 7) % 5) - 2 }));
    expect(isScratchOut(jittery)).toBe(true);
  });
});

describe('scratchOutStrokes (issue #330)', () => {
  const scribble = zigzag(6);
  const stamp: VectorStroke = { tool: 'check_full', points: [{ x: 200, y: 120 }], color: '#ef4444', pageNumber: 1 };
  const nearStamp: VectorStroke = { ...stamp, points: [{ x: 90, y: 95 }] };
  const pen: VectorStroke = { tool: 'pen', points: polyline([{ x: 150, y: 110 }, { x: 250, y: 150 }]), color: '#000', pageNumber: 1 };
  const crossed: VectorStroke = { tool: 'pen', points: polyline([{ x: 200, y: 0 }, { x: 200, y: 600 }]), color: '#000', pageNumber: 1 };
  const line: VectorStroke = { tool: 'line', points: [{ x: 120, y: 110 }, { x: 280, y: 150 }], color: '#000', pageNumber: 1 };
  const longLine: VectorStroke = { tool: 'line', points: [{ x: 0, y: 120 }, { x: 600, y: 120 }], color: '#000', pageNumber: 1 };

  it('erases stamps, pen marks and lines it covers', () => {
    expect(scratchOutStrokes([stamp, nearStamp, pen, line], 1, scribble)).toEqual([]);
  });

  it('keeps a long mark it only crosses and marks on other pages', () => {
    const otherPage = { ...stamp, pageNumber: 2 };
    expect(scratchOutStrokes([crossed, longLine, otherPage, stamp], 1, scribble)).toEqual([crossed, longLine, otherPage]);
  });

  it('answers null when it covers nothing', () => {
    const far: VectorStroke = { ...stamp, points: [{ x: 500, y: 500 }] };
    expect(scratchOutStrokes([far], 1, scribble)).toBeNull();
  });
});
