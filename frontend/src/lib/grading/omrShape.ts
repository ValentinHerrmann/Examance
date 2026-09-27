/**
 * Shape/context analysis for one MC answer box (OMR algorithm v2).
 *
 * The fill ratio alone cannot tell a cross from a hatched-out box, a box sitting in a pencil
 * shading, or a faint smudge — all of those used to read as "ticked". These features look at
 * *where* the ink sits inside the box, how dark it is, and how much ink surrounds the box
 * compared with its sibling boxes. Pure functions over the worker's binarized/gray rasters, so
 * they can be tested on synthetic bitmaps.
 *
 * Policy (issue #32 follow-up): only `solid` changes the reading (a filled box = withdrawn tick,
 * like the existing `filledHigh` rule) and it is always flagged for review; `spill` and `faint`
 * only ever downgrade a confident mark to `ambiguous`. The measurements are persisted per bubble
 * so verified data can calibrate these thresholds later.
 */
import type { OmrDetectionParams } from './omrSettings';

export type OmrBubbleState = 'blank' | 'ambiguous' | 'marked' | 'undone' | 'redone';
export type OmrShapeReason = 'solid' | 'spill' | 'faint';

export interface PixelBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface OmrShapeFeatures {
  /** Lowest dark fraction of the 3×3 cells of the (inset) box. A cross or tick always leaves a
   *  cell nearly empty; hatching or a scribble-out covers all nine. */
  minCellFill: number;
  /** Lowest ÷ highest cell fill. A bold cross covers its corner/centre cells far more than its
   *  edge-middle cells (≈0.35); hatching is even (≈0.9). Stops a thick felt-pen X counting as solid. */
  cellEvenness: number;
  /** Dark fraction of the band around the box (printed border and redo zone excluded). */
  ringFill: number;
  /** `ringFill` minus the median ring fill of the exercise's other boxes — ink *around* this box
   *  beyond what is printed around every box. Undefined for an exercise with a single box. */
  spillExcess?: number;
  /** How dark the ink in the box is, 0 (at the binarization threshold, e.g. faint pencil) to
   *  1 (as dark as the page's printed black). */
  inkContrast: number;
}

/** Integer pixel rect [x0,x1) × [y0,y1) of `bbox` shrunk by `inset` of its size on each side, clamped. */
function insetRect(bbox: PixelBox, inset: number, width: number, height: number) {
  const ix = (bbox.maxX - bbox.minX) * inset;
  const iy = (bbox.maxY - bbox.minY) * inset;
  return {
    x0: Math.max(0, Math.round(bbox.minX + ix)),
    x1: Math.min(width, Math.round(bbox.maxX - ix)),
    y0: Math.max(0, Math.round(bbox.minY + iy)),
    y1: Math.min(height, Math.round(bbox.maxY - iy)),
  };
}

/** Dark fraction of each cell of a 3×3 grid over the inset box, row-major. */
export function cellFills(
  dark: Uint8Array,
  width: number,
  height: number,
  bbox: PixelBox,
  inset: number
): number[] {
  const { x0, x1, y0, y1 } = insetRect(bbox, inset, width, height);
  const fills: number[] = [];
  for (let cy = 0; cy < 3; cy++) {
    const ya = y0 + Math.round(((y1 - y0) * cy) / 3);
    const yb = y0 + Math.round(((y1 - y0) * (cy + 1)) / 3);
    for (let cx = 0; cx < 3; cx++) {
      const xa = x0 + Math.round(((x1 - x0) * cx) / 3);
      const xb = x0 + Math.round(((x1 - x0) * (cx + 1)) / 3);
      let n = 0;
      let d = 0;
      for (let y = ya; y < yb; y++) {
        for (let x = xa; x < xb; x++) {
          n++;
          if (dark[y * width + x]) d++;
        }
      }
      fills.push(n > 0 ? d / n : 0);
    }
  }
  return fills;
}

/** Fraction of the band between +10 % and +`ringFraction` of the box size (skipping the printed
 *  border) that is dark. Pixels inside `exclude` (the redo zone — intentional ink) don't count. */
export function ringFill(
  dark: Uint8Array,
  width: number,
  height: number,
  bbox: PixelBox,
  ringFraction: number,
  exclude?: PixelBox
): number {
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  const innerPad = 0.1;
  const outer = insetRect(bbox, -ringFraction, width, height);
  const inner = {
    x0: bbox.minX - w * innerPad,
    x1: bbox.maxX + w * innerPad,
    y0: bbox.minY - h * innerPad,
    y1: bbox.maxY + h * innerPad,
  };
  let n = 0;
  let d = 0;
  for (let y = outer.y0; y < outer.y1; y++) {
    for (let x = outer.x0; x < outer.x1; x++) {
      if (x >= inner.x0 && x < inner.x1 && y >= inner.y0 && y < inner.y1) continue;
      if (exclude && x >= exclude.minX && x < exclude.maxX && y >= exclude.minY && y < exclude.maxY) continue;
      n++;
      if (dark[y * width + x]) d++;
    }
  }
  return n > 0 ? d / n : 0;
}

/** Page "black": the gray level below which 1 % of the pixels lie (printed text, fiducials). */
export function blackReference(hist: ArrayLike<number>, total: number): number {
  const target = total * 0.01;
  let acc = 0;
  for (let g = 0; g < 256; g++) {
    acc += hist[g];
    if (acc >= target) return g;
  }
  return 0;
}

/** Ink darkness in the inset box relative to the threshold (0) and the page black (1). 1 when the
 *  box holds no dark pixels at all (nothing to judge). */
export function inkContrast(
  gray: Uint8ClampedArray,
  dark: Uint8Array,
  width: number,
  height: number,
  bbox: PixelBox,
  inset: number,
  threshold: number,
  blackRef: number
): number {
  const { x0, x1, y0, y1 } = insetRect(bbox, inset, width, height);
  let n = 0;
  let sum = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * width + x;
      if (dark[i]) {
        n++;
        sum += gray[i];
      }
    }
  }
  const span = threshold - blackRef;
  if (n === 0 || span <= 0) return 1;
  return Math.max(0, Math.min(1, (threshold - sum / n) / span));
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** v1 classification: fill ratio only (plus the solid-fill/redo-zone rule). */
export function baseBubbleState(
  fill: number,
  redoRatio: number | undefined,
  p: OmrDetectionParams
): OmrBubbleState {
  if (fill < p.ambiguousLow) return 'blank';
  if (fill < p.markedHigh) return 'ambiguous';
  // Solid fill ("undo") is only meaningful for boxes with a redo zone (redoRatio defined).
  if (redoRatio === undefined || fill < p.filledHigh) return 'marked';
  // Solid fill + template has a redo zone: undone unless the redo zone itself is marked.
  return redoRatio >= p.redoMarkedHigh ? 'redone' : 'undone';
}

/**
 * v2 classification. With `shapeAnalysis` off (or no features) this is exactly `baseBubbleState`.
 * `reasons` non-empty means the reading must be reviewed by a human (the worker flags it).
 */
export function classifyBubble(
  input: { fill: number; redoRatio: number | undefined; features?: OmrShapeFeatures },
  p: OmrDetectionParams
): { state: OmrBubbleState; reasons: OmrShapeReason[] } {
  const base = baseBubbleState(input.fill, input.redoRatio, p);
  const f = input.features;
  if (!p.shapeAnalysis || !f || base === 'blank' || base === 'undone' || base === 'redone') {
    return { state: base, reasons: [] };
  }

  // Evenly covered box: a withdrawn tick, even below `filledHigh` (hatching leaves gaps).
  if (input.fill >= p.solidFillMin && f.minCellFill >= p.solidCellMin && f.cellEvenness >= p.solidEvennessMin) {
    const state: OmrBubbleState =
      input.redoRatio === undefined ? 'ambiguous' : input.redoRatio >= p.redoMarkedHigh ? 'redone' : 'undone';
    return { state, reasons: ['solid'] };
  }

  if (base !== 'marked') return { state: base, reasons: [] };

  const reasons: OmrShapeReason[] = [];
  if (f.spillExcess !== undefined && f.spillExcess >= p.spillExcessMax) reasons.push('spill');
  if (f.inkContrast < p.faintContrastMin) reasons.push('faint');
  return reasons.length > 0 ? { state: 'ambiguous', reasons } : { state: base, reasons };
}
