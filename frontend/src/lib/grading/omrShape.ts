/**
 * Per-box measurement and classification for MC answer boxes.
 *
 * Two algorithms run side by side on every box (the worker persists the other one's verdict as
 * `alt`, so they can be compared on verified data before switching — `params.algorithm` decides):
 *
 *  - **v2** (fallback): global-Otsu dark map, template rect with a fixed inset, fill-ratio
 *    thresholds plus the solid/spill/faint shape checks.
 *  - **v4** (default): `measureBox` — per-box local threshold, window snapped onto the printed border (the
 *    template rect sits ~0.5ex below the drawn box: `\OmrBox` puts the `omr://` link on the
 *    baseline, TikZ draws at `baseline=-0.5ex`), stroke structure. A cross is recognised by its
 *    stroke spanning the box, not by an area threshold: a clean interior makes a thin-pen cross
 *    fill only ~10–30 %, which is why v3 (area thresholds on v4 measurements) failed.
 *
 * Both share the redo-zone fix (`effectiveRedoRect`) and the "closer" `provisional` reading of an
 * ambiguous box, which counts until a teacher verifies it. Only `solid` changes a reading
 * (withdrawn tick, always flagged); `thin`/`faint`/`spill` only ever make a box `ambiguous`.
 *
 * Pure functions over the worker's rasters, so they can be tested on synthetic bitmaps.
 */
import type { OmrDetectionParams } from './omrSettings';

export type OmrBubbleState = 'blank' | 'ambiguous' | 'marked' | 'undone' | 'redone';
export type OmrShapeReason = 'solid' | 'spill' | 'faint' | 'thin' | 'redo';

export interface PixelBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface OmrShapeFeatures {
  /** Lowest ink fraction of the 3×3 cells of the box interior. A cross or tick leaves cells nearly
   *  empty; hatching or a scribble-out covers all nine. */
  minCellFill: number;
  /** Lowest ÷ highest cell fill. A bold cross is uneven (≈0.35), hatching is even (≈0.9). */
  cellEvenness: number;
  /** Ink fraction of the band around the box (printed border and redo zone excluded). */
  ringFill: number;
  /** `ringFill` minus the median ring fill of the exercise's other boxes. */
  spillExcess?: number;
  /** Ink darkness: 0 = at the ink threshold (faint pencil), 1 = as dark as the page's print. */
  inkContrast: number;
  /** Largest connected ink stroke inside the box: max extent ÷ box side. */
  strokeSpan: number;
  /** That stroke's pixels ÷ interior pixels. */
  strokeFrac: number;
  /** Share of the redo zone's ink lying in the third next to the box (overflow looks like ≈1). */
  redoNearFrac?: number;
  /** Offset the window was snapped by onto the printed border, as a fraction of the box size. */
  snapDx: number;
  snapDy: number;
  borderFound: boolean;
  /** Local paper gray level (0–255). */
  bg: number;
}

export interface OmrBoxMeasurement {
  /** Ink fraction of the box interior. */
  fill: number;
  /** Ink fraction of the redo zone; only for boxes that have one. */
  redoRatio?: number;
  features: Omit<OmrShapeFeatures, 'spillExcess'>;
}

/** Minimum stroke size (pixels ÷ interior) for a mark without area — keeps dust and hairs out. */
const THIN_STROKE_FRAC_MIN = 0.01;
/** A thin stroke this long provisionally reads as a tick. */
const THIN_PROVISIONAL_SPAN = 0.4;
/** Outline match (0–1) needed to trust the snapped border. */
const BORDER_FOUND_SCORE = 0.3;

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

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function percentile(hist: Uint32Array, total: number, q: number): number {
  const target = total * q;
  let acc = 0;
  for (let g = 0; g < 256; g++) {
    acc += hist[g];
    if (acc >= target) return g;
  }
  return 255;
}

function shift(b: PixelBox, dx: number, dy: number): PixelBox {
  return { minX: b.minX + dx, minY: b.minY + dy, maxX: b.maxX + dx, maxY: b.maxY + dy };
}

/**
 * Measures one box. `box`/`redo` are the template rects mapped into scan pixels; `blackRef` is
 * the page's print black (`blackReference`).
 */
export function measureBox(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  box: PixelBox,
  redo: PixelBox | undefined,
  blackRef: number,
  p: OmrDetectionParams
): OmrBoxMeasurement {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;

  // --- Local ink threshold from the paper around the box ---------------------------------
  let wx0 = box.minX - w;
  let wx1 = box.maxX + w;
  const wy0 = box.minY - h;
  const wy1 = box.maxY + h;
  if (redo) {
    wx0 = Math.min(wx0, redo.minX);
    wx1 = Math.max(wx1, redo.maxX);
  }
  const x0w = Math.max(0, Math.floor(wx0));
  const x1w = Math.min(width, Math.ceil(wx1));
  const y0w = Math.max(0, Math.floor(wy0));
  const y1w = Math.min(height, Math.ceil(wy1));
  const hist = new Uint32Array(256);
  let n = 0;
  for (let y = y0w; y < y1w; y++) {
    for (let x = x0w; x < x1w; x++) {
      hist[gray[y * width + x]]++;
      n++;
    }
  }
  const bg = n > 0 ? percentile(hist, n, 0.8) : 255;
  const inkThr = bg - p.localContrastFrac * Math.max(40, bg - blackRef);
  const isInk = (x: number, y: number) =>
    x >= 0 && x < width && y >= 0 && y < height && gray[y * width + x] < inkThr;

  // --- Snap onto the printed border --------------------------------------------------------
  // Score = ink on the outline minus ink just inside/outside it, so a hatched interior (ink
  // everywhere) doesn't pull the window around.
  const outlineScore = (b: PixelBox): number => {
    const bx0 = Math.round(b.minX);
    const bx1 = Math.round(b.maxX) - 1;
    const by0 = Math.round(b.minY);
    const by1 = Math.round(b.maxY) - 1;
    let score = 0;
    let count = 0;
    const probe = (x: number, y: number, nx: number, ny: number) => {
      const on = isInk(x, y) ? 1 : 0;
      const inner = isInk(x + 2 * nx, y + 2 * ny) ? 1 : 0;
      const outer = isInk(x - 2 * nx, y - 2 * ny) ? 1 : 0;
      score += on - 0.5 * (inner + outer);
      count++;
    };
    for (let x = bx0; x <= bx1; x++) {
      probe(x, by0, 0, 1);
      probe(x, by1, 0, -1);
    }
    for (let y = by0 + 1; y < by1; y++) {
      probe(bx0, y, 1, 0);
      probe(bx1, y, -1, 0);
    }
    return count > 0 ? score / count : 0;
  };
  const S = Math.max(1, Math.round(p.snapMaxFraction * Math.max(w, h)));
  let bestDx = 0;
  let bestDy = 0;
  let bestScore = -Infinity;
  for (let dy = -S; dy <= S; dy++) {
    for (let dx = -S; dx <= S; dx++) {
      // A tiny displacement penalty breaks ties towards the template position.
      const score = outlineScore(shift(box, dx, dy)) - 0.01 * ((Math.abs(dx) + Math.abs(dy)) / S);
      if (score > bestScore) {
        bestScore = score;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }
  const borderFound = bestScore >= BORDER_FOUND_SCORE;
  const dx = borderFound ? bestDx : 0;
  const dy = borderFound ? bestDy : 0;
  const snapped = shift(box, dx, dy);
  const snappedRedo = redo ? shift(redo, dx, dy) : undefined;

  // --- Interior: inside the printed border ------------------------------------------------
  const bandX = borderFound ? Math.max(2, Math.round(0.1 * w)) : w * p.sampleInsetFraction;
  const bandY = borderFound ? Math.max(2, Math.round(0.1 * h)) : h * p.sampleInsetFraction;
  const ix0 = Math.max(0, Math.round(snapped.minX + bandX));
  const ix1 = Math.min(width, Math.round(snapped.maxX - bandX));
  const iy0 = Math.max(0, Math.round(snapped.minY + bandY));
  const iy1 = Math.min(height, Math.round(snapped.maxY - bandY));
  const iw = Math.max(0, ix1 - ix0);
  const ih = Math.max(0, iy1 - iy0);
  const interior = new Uint8Array(iw * ih);
  let inkCount = 0;
  let inkGraySum = 0;
  for (let y = 0; y < ih; y++) {
    for (let x = 0; x < iw; x++) {
      if (isInk(ix0 + x, iy0 + y)) {
        interior[y * iw + x] = 1;
        inkCount++;
        inkGraySum += gray[(iy0 + y) * width + ix0 + x];
      }
    }
  }
  const interiorPx = iw * ih;
  const fill = interiorPx > 0 ? inkCount / interiorPx : 0;

  // 3×3 cell coverage
  const cells: number[] = [];
  for (let cy = 0; cy < 3; cy++) {
    const ya = Math.round((ih * cy) / 3);
    const yb = Math.round((ih * (cy + 1)) / 3);
    for (let cx = 0; cx < 3; cx++) {
      const xa = Math.round((iw * cx) / 3);
      const xb = Math.round((iw * (cx + 1)) / 3);
      let c = 0;
      let d = 0;
      for (let y = ya; y < yb; y++) {
        for (let x = xa; x < xb; x++) {
          c++;
          d += interior[y * iw + x];
        }
      }
      cells.push(c > 0 ? d / c : 0);
    }
  }
  const maxCell = Math.max(...cells);
  const minCellFill = Math.min(...cells);
  const cellEvenness = maxCell > 0 ? minCellFill / maxCell : 0;

  // Largest 8-connected stroke
  const seen = new Uint8Array(iw * ih);
  const stack: number[] = [];
  let strokePx = 0;
  let strokeSpan = 0;
  for (let start = 0; start < interior.length; start++) {
    if (!interior[start] || seen[start]) continue;
    let px = 0;
    let minX = iw;
    let maxX = -1;
    let minY = ih;
    let maxY = -1;
    seen[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const cur = stack.pop() as number;
      const cy = Math.floor(cur / iw);
      const cx = cur - cy * iw;
      px++;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      for (let ny = cy - 1; ny <= cy + 1; ny++) {
        for (let nx = cx - 1; nx <= cx + 1; nx++) {
          if (nx < 0 || ny < 0 || nx >= iw || ny >= ih) continue;
          const ni = ny * iw + nx;
          if (interior[ni] && !seen[ni]) {
            seen[ni] = 1;
            stack.push(ni);
          }
        }
      }
    }
    if (px > strokePx) {
      strokePx = px;
      strokeSpan = Math.max(maxX - minX + 1, maxY - minY + 1) / Math.max(1, Math.max(iw, ih));
    }
  }

  // Ink darkness relative to the threshold (0) and print black (1)
  const contrastSpan = inkThr - blackRef;
  const inkContrast =
    inkCount === 0 || contrastSpan <= 0
      ? 1
      : Math.max(0, Math.min(1, (inkThr - inkGraySum / inkCount) / contrastSpan));

  // Ring around the box (border and redo zone excluded)
  const outer = {
    x0: Math.max(0, Math.round(snapped.minX - w * p.ringFraction)),
    x1: Math.min(width, Math.round(snapped.maxX + w * p.ringFraction)),
    y0: Math.max(0, Math.round(snapped.minY - h * p.ringFraction)),
    y1: Math.min(height, Math.round(snapped.maxY + h * p.ringFraction)),
  };
  const hole = {
    x0: snapped.minX - w * 0.1,
    x1: snapped.maxX + w * 0.1,
    y0: snapped.minY - h * 0.1,
    y1: snapped.maxY + h * 0.1,
  };
  let ringN = 0;
  let ringInk = 0;
  for (let y = outer.y0; y < outer.y1; y++) {
    for (let x = outer.x0; x < outer.x1; x++) {
      if (x >= hole.x0 && x < hole.x1 && y >= hole.y0 && y < hole.y1) continue;
      if (
        snappedRedo &&
        x >= snappedRedo.minX &&
        x < snappedRedo.maxX &&
        y >= snappedRedo.minY &&
        y < snappedRedo.maxY
      ) {
        continue;
      }
      ringN++;
      if (isInk(x, y)) ringInk++;
    }
  }
  const ringFill = ringN > 0 ? ringInk / ringN : 0;

  // Redo zone
  let redoRatio: number | undefined;
  let redoNearFrac: number | undefined;
  if (snappedRedo) {
    const rw = snappedRedo.maxX - snappedRedo.minX;
    const rh = snappedRedo.maxY - snappedRedo.minY;
    const rx0 = Math.max(0, Math.round(snappedRedo.minX + rw * p.sampleInsetFraction));
    const rx1 = Math.min(width, Math.round(snappedRedo.maxX - rw * p.sampleInsetFraction));
    const ry0 = Math.max(0, Math.round(snappedRedo.minY + rh * p.sampleInsetFraction));
    const ry1 = Math.min(height, Math.round(snappedRedo.maxY - rh * p.sampleInsetFraction));
    // The third of the zone next to the box — overflow from a scribbled box lands there.
    const boxIsRight = (snappedRedo.minX + snappedRedo.maxX) / 2 < (snapped.minX + snapped.maxX) / 2;
    const nearFrom = boxIsRight ? rx1 - (rx1 - rx0) / 3 : rx0;
    const nearTo = boxIsRight ? rx1 : rx0 + (rx1 - rx0) / 3;
    let rn = 0;
    let rInk = 0;
    let rNear = 0;
    for (let y = ry0; y < ry1; y++) {
      for (let x = rx0; x < rx1; x++) {
        rn++;
        if (isInk(x, y)) {
          rInk++;
          if (x >= nearFrom && x < nearTo) rNear++;
        }
      }
    }
    redoRatio = rn > 0 ? rInk / rn : 0;
    redoNearFrac = rInk > 0 ? rNear / rInk : 0;
  }

  return {
    fill,
    ...(redoRatio !== undefined ? { redoRatio } : {}),
    features: {
      minCellFill,
      cellEvenness,
      ringFill,
      inkContrast,
      strokeSpan,
      strokeFrac: interiorPx > 0 ? strokePx / interiorPx : 0,
      ...(redoNearFrac !== undefined ? { redoNearFrac } : {}),
      snapDx: w > 0 ? dx / w : 0,
      snapDy: h > 0 ? dy / h : 0,
      borderFound,
      bg,
    },
  };
}

/**
 * Template redo rect → the zone actually left of the box. `\OmrBox` (Loesung.sty) wraps the redo
 * link in `\makebox[0pt][r]{…}` to push it left, but a `\special` has no width, so the annotation
 * starts at the box's own left edge and covers the box itself. Every captured template carries that
 * rect; correcting it at use time also fixes templates and sheets that already exist.
 * Rects are PDF user space `[x0, y0, x1, y1]`.
 */
export function effectiveRedoRect(
  box: [number, number, number, number],
  redo: [number, number, number, number]
): [number, number, number, number] {
  const w = redo[2] - redo[0];
  if (Math.abs(redo[0] - box[0]) < 1) return [box[0] - w, redo[1], box[0], redo[3]];
  return redo;
}

/** Fill-ratio state: the v2 decision base (and the v1 algorithm). */
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

export interface OmrBubbleClassification {
  state: OmrBubbleState;
  /** Why the reading was changed or doubted; non-empty → flagged for review. */
  reasons: OmrShapeReason[];
  /** For `ambiguous` only: the closer outcome, counted until a teacher verifies (true = ticked). */
  provisional?: boolean;
}

/** Provisional reading of a doubted mark, by its reasons. */
function provisionalFor(reasons: OmrShapeReason[], inkContrast: number, p: OmrDetectionParams): boolean {
  const spill = reasons.includes('spill');
  const faint = reasons.includes('faint');
  if (spill && faint) return false; // shading / smudge around the box
  if (faint) return inkContrast >= p.faintContrastMin / 2;
  return true; // spill only: the mark itself is clear
}

function doubtReasons(
  f: { spillExcess?: number; inkContrast: number },
  p: OmrDetectionParams
): OmrShapeReason[] {
  const reasons: OmrShapeReason[] = [];
  if (f.spillExcess !== undefined && f.spillExcess >= p.spillExcessMax) reasons.push('spill');
  if (f.inkContrast < p.faintContrastMin) reasons.push('faint');
  return reasons;
}

function solidOutcome(redoRatio: number | undefined, p: OmrDetectionParams): OmrBubbleClassification {
  if (redoRatio === undefined) return { state: 'ambiguous', reasons: ['solid'], provisional: false };
  return { state: redoRatio >= p.redoMarkedHigh ? 'redone' : 'undone', reasons: ['solid'] };
}

// ---------------------------------------------------------------------------------------------
// v4
// ---------------------------------------------------------------------------------------------

/**
 * v4 decision on `measureBox` output. Calibrated on the first donated verified samples
 * (40 boxes: blanks measure fill 0.00 / span 0, crosses fill 0.09–0.28 / span ≥ 0.48).
 */
export function classifyV4(
  input: { fill: number; redoRatio: number | undefined; features: OmrShapeFeatures },
  p: OmrDetectionParams
): OmrBubbleClassification {
  const { fill, redoRatio, features: f } = input;
  if (fill < p.inkMinFill && (f.strokeSpan < p.strokeSpanMin || f.strokeFrac < THIN_STROKE_FRAC_MIN)) {
    return { state: 'blank', reasons: [] };
  }

  // Evenly covered (hatching, scribble-out) or plain solid: a withdrawn tick.
  if ((f.minCellFill >= p.solidCellMin && f.cellEvenness >= p.solidEvennessMin) || fill >= p.filledHigh) {
    return solidOutcome(redoRatio, p);
  }

  const reasons = doubtReasons(f, p);
  if (reasons.length > 0) {
    return { state: 'ambiguous', reasons, provisional: provisionalFor(reasons, f.inkContrast, p) };
  }
  if (f.strokeSpan >= p.tickSpanMin) return { state: 'marked', reasons: [] };
  return { state: 'ambiguous', reasons: ['thin'], provisional: f.strokeSpan >= THIN_PROVISIONAL_SPAN };
}

// ---------------------------------------------------------------------------------------------
// v2
// ---------------------------------------------------------------------------------------------

export interface OmrV2Features {
  minCellFill: number;
  cellEvenness: number;
  ringFill: number;
  spillExcess?: number;
  inkContrast: number;
}

/** Integer rect of `bbox` shrunk by `inset` of its size on each side, clamped. */
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

/** v2: dark fraction inside the inset box on the global-Otsu `dark` map. */
export function sampleFillRatio(
  dark: Uint8Array,
  width: number,
  height: number,
  bbox: PixelBox,
  inset: number
): number {
  const { x0, x1, y0, y1 } = insetRect(bbox, inset, width, height);
  let d = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      n++;
      if (dark[y * width + x]) d++;
    }
  }
  return n > 0 ? d / n : 0;
}

/** v2: dark fraction of each cell of a 3×3 grid over the inset box, row-major. */
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

/** v2: dark fraction of the band +10 %…+`ringFraction` around the box, redo zone excluded. */
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
  const outer = insetRect(bbox, -ringFraction, width, height);
  const hole = { x0: bbox.minX - w * 0.1, x1: bbox.maxX + w * 0.1, y0: bbox.minY - h * 0.1, y1: bbox.maxY + h * 0.1 };
  let n = 0;
  let d = 0;
  for (let y = outer.y0; y < outer.y1; y++) {
    for (let x = outer.x0; x < outer.x1; x++) {
      if (x >= hole.x0 && x < hole.x1 && y >= hole.y0 && y < hole.y1) continue;
      if (exclude && x >= exclude.minX && x < exclude.maxX && y >= exclude.minY && y < exclude.maxY) continue;
      n++;
      if (dark[y * width + x]) d++;
    }
  }
  return n > 0 ? d / n : 0;
}

/** v2: ink darkness in the inset box between the Otsu threshold (0) and print black (1). */
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

/** v2 decision: fill-ratio base plus solid/spill/faint; ambiguous reads provisionally by fill. */
export function classifyV2(
  input: { fill: number; redoRatio: number | undefined; features?: OmrV2Features },
  p: OmrDetectionParams
): OmrBubbleClassification {
  const { fill, redoRatio } = input;
  const base = baseBubbleState(fill, redoRatio, p);
  const fillCloser = fill >= (p.ambiguousLow + p.markedHigh) / 2;
  const f = input.features;
  const plain = (): OmrBubbleClassification =>
    base === 'ambiguous' ? { state: base, reasons: [], provisional: fillCloser } : { state: base, reasons: [] };

  if (!p.shapeAnalysis || !f || base === 'blank' || base === 'undone' || base === 'redone') return plain();

  if (fill >= p.solidFillMin && f.minCellFill >= p.solidCellMin && f.cellEvenness >= p.solidEvennessMin) {
    return solidOutcome(redoRatio, p);
  }
  if (base !== 'marked') return plain();

  const reasons = doubtReasons(f, p);
  if (reasons.length === 0) return plain();
  return { state: 'ambiguous', reasons, provisional: provisionalFor(reasons, f.inkContrast, p) };
}
