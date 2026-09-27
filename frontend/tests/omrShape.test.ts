import { describe, it, expect } from "vitest";
import {
  baseBubbleState,
  blackReference,
  cellFills,
  classifyBubble,
  inkContrast,
  median,
  ringFill,
  type PixelBox,
} from "../src/lib/grading/omrShape";
import { DEFAULT_OMR_PARAMS } from "../src/lib/grading/omrSettings";

// Synthetic page: 80×80 px, one 25 px box (≈ 4.5 mm at scanScale 2) at (25,25).
const W = 80;
const H = 80;
const THRESHOLD = 160;
const BOX: PixelBox = { minX: 25, minY: 25, maxX: 50, maxY: 50 };
const INSET = DEFAULT_OMR_PARAMS.sampleInsetFraction;

function page() {
  const gray = new Uint8ClampedArray(W * H).fill(250);
  const ink = (x: number, y: number, g = 30) => {
    if (x >= 0 && x < W && y >= 0 && y < H) gray[y * W + x] = g;
  };
  const dark = () => {
    const d = new Uint8Array(W * H);
    for (let i = 0; i < gray.length; i++) d[i] = gray[i] < THRESHOLD ? 1 : 0;
    return d;
  };
  return { gray, ink, dark };
}

/** Same measurement as the worker's sampleFillRatio. */
function fillOf(dark: Uint8Array, box: PixelBox) {
  const cells = cellFills(dark, W, H, box, INSET);
  return cells.reduce((a, b) => a + b, 0) / cells.length;
}

function drawX(ink: (x: number, y: number, g?: number) => void, halfWidth: number, g = 30) {
  for (let y = BOX.minY; y < BOX.maxY; y++) {
    for (let x = BOX.minX; x < BOX.maxX; x++) {
      const u = x - BOX.minX;
      const v = y - BOX.minY;
      if (Math.abs(u - v) <= halfWidth || Math.abs(u + v - 24) <= halfWidth) ink(x, y, g);
    }
  }
}

function features(gray: Uint8ClampedArray, dark: Uint8Array, siblingRings: number[] = [0, 0, 0]) {
  const cells = cellFills(dark, W, H, BOX, INSET);
  const ring = ringFill(dark, W, H, BOX, DEFAULT_OMR_PARAMS.ringFraction);
  return {
    minCellFill: Math.min(...cells),
    cellEvenness: Math.min(...cells) / Math.max(...cells),
    ringFill: ring,
    spillExcess: ring - median(siblingRings),
    inkContrast: inkContrast(gray, dark, W, H, BOX, INSET, THRESHOLD, 20),
  };
}

describe("omrShape", () => {
  it("a bold felt-pen cross stays marked with no reasons", () => {
    const { gray, ink, dark } = page();
    drawX(ink, 3.5); // ~7 px stroke: edge-middle cells get partly covered
    const d = dark();
    const f = features(gray, d);
    expect(f.cellEvenness).toBeLessThan(DEFAULT_OMR_PARAMS.solidEvennessMin);
    const fill = fillOf(d, BOX);
    expect(fill).toBeGreaterThanOrEqual(DEFAULT_OMR_PARAMS.markedHigh);
    const res = classifyBubble({ fill, redoRatio: 0, features: f }, DEFAULT_OMR_PARAMS);
    expect(res.reasons).toEqual([]);
    expect(res.state).toBe(baseBubbleState(fill, 0, DEFAULT_OMR_PARAMS));
  });

  it("a hatched-out box is withdrawn (with redo zone) and always flagged as solid", () => {
    const { gray, ink, dark } = page();
    for (let y = BOX.minY; y < BOX.maxY; y++) {
      if (y % 3 === 2) continue; // hatching leaves thin gaps: fill ≈ 0.6, below filledHigh
      for (let x = BOX.minX; x < BOX.maxX; x++) ink(x, y);
    }
    const d = dark();
    const f = features(gray, d);
    const fill = fillOf(d, BOX);
    expect(fill).toBeLessThan(DEFAULT_OMR_PARAMS.filledHigh);
    expect(baseBubbleState(fill, 0, DEFAULT_OMR_PARAMS)).toBe("marked"); // the v1 false positive

    const withRedo = classifyBubble({ fill, redoRatio: 0, features: f }, DEFAULT_OMR_PARAMS);
    expect(withRedo).toEqual({ state: "undone", reasons: ["solid"] });

    const redone = classifyBubble({ fill, redoRatio: 0.6, features: f }, DEFAULT_OMR_PARAMS);
    expect(redone).toEqual({ state: "redone", reasons: ["solid"] });

    const legacy = classifyBubble({ fill, redoRatio: undefined, features: f }, DEFAULT_OMR_PARAMS);
    expect(legacy).toEqual({ state: "ambiguous", reasons: ["solid"] });
  });

  it("ink shading around one box (not its siblings) is flagged as spill", () => {
    const { gray, ink, dark } = page();
    drawX(ink, 3.5);
    // Shade a band around the box, outside the printed border.
    for (let y = BOX.minY - 8; y < BOX.maxY + 8; y++) {
      for (let x = BOX.minX - 8; x < BOX.maxX + 8; x++) {
        const outside = x < BOX.minX - 3 || x >= BOX.maxX + 3 || y < BOX.minY - 3 || y >= BOX.maxY + 3;
        if (outside && (x + y) % 2 === 0) ink(x, y);
      }
    }
    const d = dark();
    const f = features(gray, d, [0.02, 0.03]);
    expect(f.spillExcess).toBeGreaterThanOrEqual(DEFAULT_OMR_PARAMS.spillExcessMax);
    const fill = fillOf(d, BOX);
    const res = classifyBubble({ fill, redoRatio: 0, features: f }, DEFAULT_OMR_PARAMS);
    expect(res.state).toBe("ambiguous");
    expect(res.reasons).toContain("spill");
  });

  it("a pale (pencil-like) mark is flagged as faint", () => {
    const { gray, ink, dark } = page();
    drawX(ink, 3.5, 150); // just below the threshold
    const d = dark();
    const f = features(gray, d);
    expect(f.inkContrast).toBeLessThan(DEFAULT_OMR_PARAMS.faintContrastMin);
    const fill = fillOf(d, BOX);
    const res = classifyBubble({ fill, redoRatio: 0, features: f }, DEFAULT_OMR_PARAMS);
    expect(res.state).toBe("ambiguous");
    expect(res.reasons).toContain("faint");
  });

  it("the redo zone is excluded from the ring", () => {
    const { ink, dark } = page();
    const redo: PixelBox = { minX: 5, minY: 25, maxX: 25, maxY: 50 };
    for (let y = redo.minY; y < redo.maxY; y++) for (let x = redo.minX; x < redo.maxX; x++) ink(x, y);
    const d = dark();
    expect(ringFill(d, W, H, BOX, DEFAULT_OMR_PARAMS.ringFraction, redo)).toBe(0);
    expect(ringFill(d, W, H, BOX, DEFAULT_OMR_PARAMS.ringFraction)).toBeGreaterThan(0);
  });

  it("with shape analysis off, classification equals v1", () => {
    const p = { ...DEFAULT_OMR_PARAMS, shapeAnalysis: false };
    const f = { minCellFill: 0.9, cellEvenness: 1, ringFill: 0.9, spillExcess: 0.9, inkContrast: 0 };
    for (const fill of [0, 0.1, 0.3, 0.5, 0.6, 0.8, 0.95]) {
      for (const redoRatio of [undefined, 0, 0.6]) {
        expect(classifyBubble({ fill, redoRatio, features: f }, p)).toEqual({
          state: baseBubbleState(fill, redoRatio, p),
          reasons: [],
        });
      }
    }
  });

  it("blackReference finds the 1st-percentile gray", () => {
    const hist = new Array<number>(256).fill(0);
    hist[20] = 5;
    hist[250] = 995;
    expect(blackReference(hist, 1000)).toBe(20);
  });
});
