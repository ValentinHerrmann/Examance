import { describe, it, expect } from "vitest";
import {
  baseBubbleState,
  blackReference,
  classifyV2,
  classifyV4,
  effectiveRedoRect,
  measureBox,
  type OmrShapeFeatures,
  type PixelBox,
} from "../src/lib/grading/omrShape";
import { DEFAULT_OMR_PARAMS } from "../src/lib/grading/omrSettings";

// Synthetic page at scanScale 3: a printed 38 px box (≈ 4.5 mm) with a 1 px border, a redo zone
// (≈ 4 mm) directly left of it. The template rect sits 5 px *below* the printed box, like the
// real `\OmrBox` link annotation (baseline) vs its TikZ drawing (baseline=-0.5ex).
const W = 120;
const H = 110;
const P = DEFAULT_OMR_PARAMS;
const PRINTED: PixelBox = { minX: 50, minY: 30, maxX: 88, maxY: 68 };
const OFFSET_Y = 5;
const TEMPLATE_BOX: PixelBox = { ...PRINTED, minY: PRINTED.minY + OFFSET_Y, maxY: PRINTED.maxY + OFFSET_Y };
const TEMPLATE_REDO: PixelBox = { minX: 16, minY: TEMPLATE_BOX.minY, maxX: 50, maxY: TEMPLATE_BOX.maxY };
const BLACK = 20;

function page(paper = 250) {
  const gray = new Uint8ClampedArray(W * H).fill(paper);
  const ink = (x: number, y: number, g = 30) => {
    if (x >= 0 && x < W && y >= 0 && y < H) gray[Math.round(y) * W + Math.round(x)] = g;
  };
  // printed border
  for (let x = PRINTED.minX; x < PRINTED.maxX; x++) {
    ink(x, PRINTED.minY);
    ink(x, PRINTED.maxY - 1);
  }
  for (let y = PRINTED.minY; y < PRINTED.maxY; y++) {
    ink(PRINTED.minX, y);
    ink(PRINTED.maxX - 1, y);
  }
  return { gray, ink };
}

function drawX(ink: (x: number, y: number, g?: number) => void, halfWidth: number, g = 30, inset = 3) {
  const x0 = PRINTED.minX + inset;
  const x1 = PRINTED.maxX - inset;
  const y0 = PRINTED.minY + inset;
  const size = x1 - x0;
  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      if (Math.abs(u - v) <= halfWidth || Math.abs(u + v - (size - 1)) <= halfWidth) ink(x0 + u, y0 + v, g);
    }
  }
}

function hatchBox(ink: (x: number, y: number) => void) {
  for (let y = PRINTED.minY + 1; y < PRINTED.maxY - 1; y++) {
    if (y % 3 === 2) continue; // gaps: fill ≈ 0.67, below filledHigh
    for (let x = PRINTED.minX + 1; x < PRINTED.maxX - 1; x++) ink(x, y);
  }
}

function classify(gray: Uint8ClampedArray, withRedo = true, siblingRing = 0) {
  const m = measureBox(gray, W, H, TEMPLATE_BOX, withRedo ? TEMPLATE_REDO : undefined, BLACK, P);
  const features: OmrShapeFeatures = { ...m.features, spillExcess: m.features.ringFill - siblingRing };
  return { m, res: classifyV4({ fill: m.fill, redoRatio: m.redoRatio, features }, P) };
}

describe("omrShape v4 (measureBox + classifyV4)", () => {
  it("snaps the window onto the printed border (template sits below the drawn box)", () => {
    const { gray } = page();
    const m = measureBox(gray, W, H, TEMPLATE_BOX, TEMPLATE_REDO, BLACK, P);
    expect(m.features.borderFound).toBe(true);
    expect(m.features.snapDy * (TEMPLATE_BOX.maxY - TEMPLATE_BOX.minY)).toBeCloseTo(-OFFSET_Y, 0);
    expect(m.fill).toBeLessThan(0.02); // the border line is no longer sampled
  });

  it("an empty box stays blank", () => {
    const { gray } = page();
    expect(classify(gray).res).toEqual({ state: "blank", reasons: [] });
  });

  it("a thin-pen cross spanning the box is a confident tick (img 9 case)", () => {
    const { gray, ink } = page();
    for (let t = 0; t < 30; t++) {
      ink(54 + t, 34 + t);
      ink(83 - t, 34 + t);
    }
    const { m, res } = classify(gray);
    expect(m.fill).toBeLessThan(P.markedHigh); // v3 read this as ambiguous / not ticked
    expect(res).toEqual({ state: "marked", reasons: [] });
  });

  it("a short stroke is flagged 'thin'", () => {
    const { gray, ink } = page();
    for (let t = 0; t < 12; t++) ink(62 + t, 44 + t);
    const { res } = classify(gray);
    expect(res.state).toBe("ambiguous");
    expect(res.reasons).toEqual(["thin"]);
  });

  it("a bold felt-pen cross is a confident mark", () => {
    const { gray, ink } = page();
    drawX(ink, 4);
    const { m, res } = classify(gray);
    expect(m.features.cellEvenness).toBeLessThan(P.solidEvennessMin);
    expect(res).toEqual({ state: "marked", reasons: [] });
  });

  it("a hatched box with a mark in the (real) redo zone reads as re-ticked, flagged", () => {
    const { gray, ink } = page();
    hatchBox(ink);
    for (let y = PRINTED.minY + 2; y < PRINTED.maxY - 2; y++) {
      for (let x = 18; x < 46; x++) ink(x, y);
    }
    expect(classify(gray).res).toEqual({ state: "redone", reasons: ["solid"] });
  });

  it("a hatched box with an empty redo zone is withdrawn", () => {
    const { gray, ink } = page();
    hatchBox(ink);
    expect(classify(gray).res).toEqual({ state: "undone", reasons: ["solid"] });
  });

  it("a hatched box without a redo zone is flagged and provisionally not ticked", () => {
    const { gray, ink } = page();
    hatchBox(ink);
    expect(classify(gray, false).res).toEqual({ state: "ambiguous", reasons: ["solid"], provisional: false });
  });

  it("a pale (pencil-like) mark is flagged faint", () => {
    const { gray, ink } = page();
    drawX(ink, 4, 150);
    const { res } = classify(gray);
    expect(res.state).toBe("ambiguous");
    expect(res.reasons).toContain("faint");
  });

  it("shading around the box plus faint ink provisionally reads as not ticked", () => {
    const { gray, ink } = page();
    drawX(ink, 4, 150);
    for (let y = 16; y < 82; y++) {
      for (let x = 36; x < 102; x++) {
        const outside = x < 45 || x >= 93 || y < 25 || y >= 73;
        if (outside && (x + y) % 2 === 0) ink(x, y, 150);
      }
    }
    const { res } = classify(gray, false);
    expect(res.state).toBe("ambiguous");
    expect(res.reasons).toEqual(["spill", "faint"]);
    expect(res.provisional).toBe(false);
  });

  it("the local threshold still finds ink on a darker (grey) scan", () => {
    const { gray, ink } = page(190);
    drawX(ink, 4);
    expect(classify(gray).res.state).toBe("marked");
  });

  it("v2 with shape analysis off equals the fill-ratio base; ambiguous reads by fill", () => {
    const p = { ...P, shapeAnalysis: false };
    const f = { minCellFill: 0.9, cellEvenness: 1, ringFill: 0.9, spillExcess: 0.9, inkContrast: 0 };
    for (const fill of [0, 0.1, 0.2, 0.35, 0.5, 0.8, 0.95]) {
      for (const redoRatio of [undefined, 0, 0.6]) {
        const res = classifyV2({ fill, redoRatio, features: f }, p);
        expect(res.state).toBe(baseBubbleState(fill, redoRatio, p));
        expect(res.reasons).toEqual([]);
        if (res.state === "ambiguous") expect(res.provisional).toBe(fill >= (p.ambiguousLow + p.markedHigh) / 2);
      }
    }
  });

  it("the redo link rect that overlaps the box is moved left of it; a correct one is kept", () => {
    const box: [number, number, number, number] = [100, 200, 112.8, 212.8];
    expect(effectiveRedoRect(box, [100, 200, 111.4, 212.8])).toEqual([88.6, 200, 100, 212.8]);
    expect(effectiveRedoRect(box, [88.6, 200, 100, 212.8])).toEqual([88.6, 200, 100, 212.8]);
  });

  it("blackReference finds the 1st-percentile gray", () => {
    const hist = new Array<number>(256).fill(0);
    hist[20] = 15;
    hist[250] = 985;
    expect(blackReference(hist, 1000)).toBe(20);
    // below the 1 % cutoff the dark pixels are noise, not the print black
    hist[20] = 5;
    hist[250] = 995;
    expect(blackReference(hist, 1000)).toBe(250);
  });
});

// First donated verified samples (dev DB, one exam): numbers only — no crops, no ids.
// [label, fill, minCellFill, cellEvenness, ringFill, spillExcess, inkContrast, strokeSpan, strokeFrac]
// v3 as shipped read 23/40 correctly with 23 unsure; v4 must stay at ≥ 38 with ≤ 8 unsure.
const DONATED_V3_FEATURES: number[][] = [
  [0, 0.0, 0.0, 0.0, 0.0, -0.036, 1.0, 0.0, 0.0],
  [0, 0.0, 0.0, 0.0, 0.0, 0, 1.0, 0.0, 0.0],
  [1, 0.233, 0.0, 0.0, 0.001, 0.001, 0.432, 1.0, 0.233],
  [1, 0.14, 0.0, 0.0, 0.036, 0.036, 0.389, 0.655, 0.117],
  [0, 0.0, 0.0, 0.0, 0.0, -0.001, 1.0, 0.0, 0.0],
  [0, 0.0, 0.0, 0.0, 0.0, 0, 1.0, 0.0, 0.0],
  [1, 0.227, 0.0, 0.0, 0.004, 0.004, 0.409, 1.0, 0.218],
  [0, 0.0, 0.0, 0.0, 0.0, -0.01, 1.0, 0.0, 0.0],
  [0, 0.0, 0.0, 0.0, 0.0, -0.001, 1.0, 0.0, 0.0],
  [0, 0.0, 0.0, 0.0, 0.055, -0.026, 1.0, 0.0, 0.0],
  [0, 0.0, 0.0, 0.0, 0.0, -0.01, 1.0, 0.0, 0.0],
  [0, 0.437, 0.36, 0.661, 0.048, 0.032, 0.241, 1.0, 0.25],
  [0, 0.0, 0.0, 0.0, 0.0, 0, 1.0, 0.0, 0.0],
  [0, 0.0, 0.0, 0.0, 0.0, -0.081, 1.0, 0.0, 0.0],
  [0, 0.0, 0.0, 0.0, 0.0, -0.002, 1.0, 0.0, 0.0],
  [1, 0.137, 0.0, 0.0, 0.0, 0, 0.483, 0.586, 0.137],
  [0, 0.0, 0.0, 0.0, 0.0, 0, 1.0, 0.0, 0.0],
  [1, 0.186, 0.0, 0.0, 0.0, -0.048, 0.161, 1.0, 0.186],
  [0, 0.0, 0.0, 0.0, 0.0, 0, 1.0, 0.0, 0.0],
  [1, 0.205, 0.0, 0.0, 0.081, 0.026, 0.642, 1.0, 0.205],
  [1, 0.229, 0.0, 0.0, 0.012, 0.012, 0.487, 1.0, 0.229],
  [1, 0.234, 0.0, 0.0, 0.011, 0.011, 0.479, 1.0, 0.234],
  [1, 0.281, 0.0, 0.0, 0.01, 0.01, 0.536, 1.0, 0.281],
  [0, 0.887, 0.531, 0.536, 0.002, 0.002, 0.829, 1.0, 0.887],
  [1, 0.205, 0.0, 0.0, 0.002, 0.002, 0.384, 1.0, 0.205],
  [0, 0.764, 0.432, 0.475, 0.098, 0.043, 0.834, 1.0, 0.764],
  [0, 0.351, 0.06, 0.09, 0.453, 0.437, 0.167, 0.655, 0.133],
  [1, 0.17, 0.0, 0.0, 0.0, 0, 0.467, 0.724, 0.17],
  [1, 0.092, 0.0, 0.0, 0.0, 0, 0.338, 0.483, 0.082],
  [0, 0.0, 0.0, 0.0, 0.055, -0.026, 1.0, 0.0, 0.0],
  [1, 0.098, 0.0, 0.0, 0.016, -0.032, 0.158, 1.0, 0.092],
  [1, 0.281, 0.0, 0.0, 0.01, 0.01, 0.536, 1.0, 0.281],
  [1, 0.205, 0.0, 0.0, 0.081, 0.026, 0.642, 1.0, 0.205],
  [0, 0.0, 0.0, 0.0, 0.0, -0.011, 1.0, 0.0, 0.0],
  [1, 0.234, 0.0, 0.0, 0.011, 0.011, 0.479, 1.0, 0.234],
  [0, 0.0, 0.0, 0.0, 0.0, -0.081, 1.0, 0.0, 0.0],
  [1, 0.231, 0.0, 0.0, 0.0, -0.002, 0.672, 0.964, 0.23],
  [1, 0.167, 0.0, 0.0, 0.065, 0.065, 0.414, 1.0, 0.167],
  [0, 0.0, 0.0, 0.0, 0.0, -0.011, 1.0, 0.0, 0.0],
  [1, 0.764, 0.432, 0.475, 0.098, 0.043, 0.834, 1.0, 0.764]
];

describe("v4 replay on the first donated samples", () => {
  it("reads ≥ 38/40 boxes correctly with ≤ 8 unsure", () => {
    let correct = 0;
    let unsure = 0;
    for (const [label, fill, minCellFill, cellEvenness, ringFill, spillExcess, inkContrast, strokeSpan, strokeFrac] of DONATED_V3_FEATURES) {
      const features: OmrShapeFeatures = {
        minCellFill, cellEvenness, ringFill, spillExcess, inkContrast, strokeSpan, strokeFrac,
        snapDx: 0, snapDy: 0, borderFound: true, bg: 255,
      };
      // The recorded redo ratio measured the box itself (pre-fix geometry) — treat the zone as empty.
      const res = classifyV4({ fill, redoRatio: 0, features }, P);
      const selected = res.state === "marked" || res.state === "redone" || (res.state === "ambiguous" && res.provisional !== false);
      if (selected === (label === 1)) correct++;
      if (res.state === "ambiguous" || res.reasons.length > 0) unsure++;
    }
    expect(DONATED_V3_FEATURES).toHaveLength(40);
    expect(correct).toBeGreaterThanOrEqual(38);
    expect(unsure).toBeLessThanOrEqual(8);
  });
});
