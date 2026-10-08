/**
 * Web Worker for OMR and fiducial alignment: binarize (Otsu), locate the 4 corner fiducials (largest dark blob per quadrant),
 * homography (4-point DLT, 3-point affine fallback), sample each bubble's fill ratio, score via mcScore.ts. No OpenCV.js:
 * bubble positions come from the PDF's `omr://` link annotations ("Prepare OMR"); only fiducials are detected.
 */

import type { OmrFiducialRect, OmrPageTemplate } from '#lib/db/schema';
import { computeMcScore, type McQuestionType } from '#lib/grading/mcScore';
import {
  normalizeOmrParams,
  type OmrDetectionParams,
  type OmrPageStats,
} from '#lib/grading/omrSettings';
import {
  blackReference,
  cellFills,
  classifyV2,
  classifyV4,
  effectiveRedoRect,
  inkContrast,
  measureBox,
  median,
  ringFill,
  sampleFillRatio,
  type OmrBubbleClassification,
  type OmrBubbleState,
  type OmrShapeFeatures,
  type OmrShapeReason,
} from '#lib/grading/omrShape';

export interface OmrExerciseAnswerKey {
  exerciseId: string;
  questionType: McQuestionType;
  correctAnswers: number[];
  penalty: number;
  maxPoints: number;
}

export interface OmrWorkerRequest {
  type: 'OMR_PROCESS';
  imageData: ImageData;
  pageTemplate: OmrPageTemplate;
  /** Scale factor the scan was rasterized at (e.g. 2.0), matching pdfjs viewport scale semantics. */
  scanScale: number;
  answerKeys: OmrExerciseAnswerKey[];
  /** Detection thresholds for this run (`omrSettings.ts`). Absent → built-in defaults.
   *  The caller snapshots these once per run and stamps the same object into `omrMeta.run`. */
  params?: OmrDetectionParams;
}

export interface OmrBubbleReading {
  optionIndex: number;
  fillRatio: number;
  state: OmrBubbleState;
  /** Redo-zone fill ratio, measured whenever the bubble's template has a redoRect. */
  redoRatio?: number;
  /** v4 measurements (`measureBox`), always computed — also when v2 decides. */
  shape?: OmrShapeFeatures;
  /** Why the shape analysis changed or flagged this reading; non-empty → flagged for review. */
  reasons?: OmrShapeReason[];
  /** For `ambiguous` boxes: the closer outcome (true = ticked), counted until verified. */
  provisional?: boolean;
  /** Verdict of the algorithm that did *not* decide (shadow run), for comparison on verified data. */
  alt?: { algorithm: number; state: OmrBubbleState; reasons?: OmrShapeReason[]; provisional?: boolean };
    /** Bubble bbox normalized to [0,1] of (width, height) as [minX,minY,maxX,maxY], so the grading viewer can draw it at its own scale. [0,0,0,0] when alignment failed (state is 'blank', nothing drawn). */
  rect: [number, number, number, number];
}

export interface OmrExerciseResult {
  exerciseId: string;
  /** 0-based, matches OmrPageTemplate.pageIndex — lets the grading viewer show
   *  detection boxes only for the page currently on screen. */
  pageIndex: number;
  selectedOptions: number[];
  score: number;
  confidence: 'high' | 'ambiguous' | 'failed';
  flaggedOptions: number[];
  bubbles: OmrBubbleReading[];
  alignmentUncertain?: boolean;
}

export type OmrWorkerResponse =
  | {
      type: 'OMR_RESULT';
      results: OmrExerciseResult[];
      alignmentFailed: boolean;
      alignmentUncertain: boolean;
      fiducialsFound: number;
      /** Corner indices (0=BL,1=BR,2=TR,3=TL) actually detected this pass — lets a
       *  caller report exactly which corner is missing instead of just a count. */
      fiducialCorners: number[];
      /** Registration diagnostics for this page — persisted with each score for future calibration. */
      pageStats: OmrPageStats;
    }
  | { type: 'ERROR'; message: string };

// Every threshold below comes from `OmrDetectionParams` (lib/grading/omrSettings.ts), whose
// defaults are the constants this file used to hardcode.

type Homography = [number, number, number, number, number, number, number, number, number];

function grayHistogram(gray: Uint8ClampedArray): number[] {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  return hist;
}

/** Grayscale (luminance) Otsu threshold — histogram + between-class variance maximization. */
function computeOtsuThreshold(hist: number[], total: number): number {
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let varMax = -1;
  let threshold = 127;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);
    if (varBetween > varMax) {
      varMax = varBetween;
      threshold = t;
    }
  }
  return threshold;
}

/** Gaussian elimination with partial pivoting. Returns null if the system is singular. */
function solveLinearSystem(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const augmented = matrix.map((row, i) => [...row, rhs[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(augmented[col][col]);
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(augmented[r][col]) > maxVal) {
        maxVal = Math.abs(augmented[r][col]);
        pivotRow = r;
      }
    }
    if (maxVal < 1e-10) return null;

    [augmented[col], augmented[pivotRow]] = [augmented[pivotRow], augmented[col]];

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = augmented[r][col] / augmented[col][col];
      for (let c = col; c <= n; c++) augmented[r][c] -= factor * augmented[col][c];
    }
  }

  return augmented.map((row, i) => row[n] / row[i]);
}

/** Full perspective homography from 4 point correspondences (standard DLT, h33 fixed to 1). */
function buildHomography4(src: [number, number][], dst: [number, number][]): Homography | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [X, Y] = src[i];
    const [x, y] = dst[i];
    A.push([X, Y, 1, 0, 0, 0, -X * x, -Y * x]);
    b.push(x);
    A.push([0, 0, 0, X, Y, 1, -X * y, -Y * y]);
    b.push(y);
  }
  const h = solveLinearSystem(A, b);
  if (!h) return null;
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/** Affine fallback (6 unknowns) from exactly 3 point correspondences — no perspective term. */
function buildAffine3(src: [number, number][], dst: [number, number][]): Homography | null {
  const A = src.map(([X, Y]) => [X, Y, 1]);
  const bx = dst.map(([x]) => x);
  const by = dst.map(([, y]) => y);
  const abc = solveLinearSystem(A, bx);
  const def = solveLinearSystem(A, by);
  if (!abc || !def) return null;
  return [abc[0], abc[1], abc[2], def[0], def[1], def[2], 0, 0, 1];
}

function transformPoint(H: Homography, x: number, y: number): [number, number] {
  const [h11, h12, h13, h21, h22, h23, h31, h32, h33] = H;
  const w = h31 * x + h32 * y + h33;
  return [(h11 * x + h12 * y + h13) / w, (h21 * x + h22 * y + h23) / w];
}

/** Template point (PDF points, origin bottom-left) -> expected pixel at the scan's raster scale. */
function pdfPointToExpectedPixel(
  px: number,
  py: number,
  scanScale: number,
  pageHeightPt: number
): [number, number] {
  return [px * scanScale, (pageHeightPt - py) * scanScale];
}

/**
 * Finds the connected dark blob in [qx0,qx1) x [qy0,qy1) that best matches a fiducial, scored by
 * proximity to the template-expected position rather than area: a logo or student QR in the same
 * quadrant is often the largest blob but is filtered out by the area/aspect checks.
 */
function findBestFiducialBlob(
  dark: Uint8Array,
  visited: Uint8Array,
  width: number,
  qx0: number,
  qy0: number,
  qx1: number,
  qy1: number,
  expectedAreaPx: number,
  expectedX: number,
  expectedY: number,
  maxDistPx: number,
  p: OmrDetectionParams
): { x: number; y: number } | null {
  const minArea = Math.max(9, expectedAreaPx * p.fiducialAreaMinRatio);
  const maxArea = expectedAreaPx * p.fiducialAreaMaxRatio;

  let best: { x: number; y: number; dist: number } | null = null;
  const stack: number[] = [];

  for (let y = qy0; y < qy1; y++) {
    for (let x = qx0; x < qx1; x++) {
      const idx = y * width + x;
      if (visited[idx] || !dark[idx]) continue;

      let area = 0;
      let sumX = 0;
      let sumY = 0;
      let minBx = x;
      let maxBx = x;
      let minBy = y;
      let maxBy = y;
      stack.push(idx);
      visited[idx] = 1;

      while (stack.length > 0) {
        const cur = stack.pop() as number;
        const cy = Math.floor(cur / width);
        const cx = cur - cy * width;
        area++;
        sumX += cx;
        sumY += cy;
        if (cx < minBx) minBx = cx;
        if (cx > maxBx) maxBx = cx;
        if (cy < minBy) minBy = cy;
        if (cy > maxBy) maxBy = cy;

        const neighbors: [number, number][] = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < qx0 || nx >= qx1 || ny < qy0 || ny >= qy1) continue;
          const nidx = ny * width + nx;
          if (!visited[nidx] && dark[nidx]) {
            visited[nidx] = 1;
            stack.push(nidx);
          }
        }
      }

      if (area < minArea || area > maxArea) continue;

      const bw = maxBx - minBx + 1;
      const bh = maxBy - minBy + 1;
      const aspect = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
      if (aspect > p.fiducialMaxAspectRatio) continue;

      const cx = sumX / area;
      const cy = sumY / area;
      const dist = Math.hypot(cx - expectedX, cy - expectedY);
      if (dist > maxDistPx) continue;

      if (!best || dist < best.dist) {
        best = { x: cx, y: cy, dist };
      }
    }
  }

  if (!best) return null;
  return { x: best.x, y: best.y };
}

/** Quadrant bounds [x0,y0,x1,y1) to search for a given corner, per the 0=BL,1=BR,2=TR,3=TL convention. */
function quadrantForCorner(
  corner: 0 | 1 | 2 | 3,
  width: number,
  height: number,
  quadrantFraction: number
): [number, number, number, number] {
  const qw = Math.floor(width * quadrantFraction);
  const qh = Math.floor(height * quadrantFraction);
  switch (corner) {
    case 0: // bottom-left
      return [0, height - qh, qw, height];
    case 1: // bottom-right
      return [width - qw, height - qh, width, height];
    case 2: // top-right
      return [width - qw, 0, width, qh];
    case 3: // top-left
      return [0, 0, qw, qh];
  }
}

function bubbleBBoxInImage(
  H: Homography,
  rect: [number, number, number, number],
  scanScale: number,
  pageHeightPt: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  const [x0, y0, x1, y1] = rect;
  const corners: [number, number][] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ].map(([px, py]) => {
    const [pixelX, pixelY] = pdfPointToExpectedPixel(px, py, scanScale, pageHeightPt);
    return transformPoint(H, pixelX, pixelY);
  });
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

self.onmessage = (event: MessageEvent<OmrWorkerRequest>) => {
  const { imageData, pageTemplate, scanScale, answerKeys } = event.data;
  const params = normalizeOmrParams(event.data.params);
  try {
    const { width, height, data } = imageData;

    const gray = new Uint8ClampedArray(width * height);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    const hist = grayHistogram(gray);
    const threshold = computeOtsuThreshold(hist, gray.length);
    const blackRef = blackReference(hist, gray.length);
    const dark = new Uint8Array(width * height);
    for (let p = 0; p < gray.length; p++) dark[p] = gray[p] < threshold ? 1 : 0;

    // Locate each fiducial: expected position from the template, searched for in the
    // corresponding quadrant of the actual scan (a scan can be shifted/skewed, not rotated
    // past quadrant boundaries under normal handling).
    const visited = new Uint8Array(width * height);
    const srcPts: [number, number][] = [];
    const dstPts: [number, number][] = [];
    let fiducialsFound = 0;
    const fiducialCorners: number[] = [];

    const fiducialsByCorner = new Map<number, OmrFiducialRect>();
    for (const f of pageTemplate.fiducials) fiducialsByCorner.set(f.corner, f);

    for (const corner of [0, 1, 2, 3] as const) {
      const template = fiducialsByCorner.get(corner);
      if (!template) continue;

      const [rx0, ry0, rx1, ry1] = template.rect;
      const centerPtX = (rx0 + rx1) / 2;
      const centerPtY = (ry0 + ry1) / 2;
      const [expectedX, expectedY] = pdfPointToExpectedPixel(
        centerPtX,
        centerPtY,
        scanScale,
        pageTemplate.pageHeightPt
      );

      const sizePt = (rx1 - rx0 + (ry1 - ry0)) / 2;
      const expectedAreaPx = Math.pow(sizePt * scanScale, 2);
      const maxDistPx = params.fiducialMaxDistFraction * Math.min(width, height);

      const [qx0, qy0, qx1, qy1] = quadrantForCorner(corner, width, height, params.quadrantFraction);
      let detected = findBestFiducialBlob(
        dark,
        visited,
        width,
        qx0,
        qy0,
        qx1,
        qy1,
        expectedAreaPx,
        expectedX,
        expectedY,
        maxDistPx,
        params
      );

      // Tight-window retry if quadrant search failed (e.g. fiducial merged with nearby content)
      if (!detected) {
        const half = Math.ceil(Math.sqrt(expectedAreaPx) * 1.5);
        const tx0 = Math.max(0, Math.floor(expectedX - half));
        const ty0 = Math.max(0, Math.floor(expectedY - half));
        const tx1 = Math.min(width, Math.ceil(expectedX + half));
        const ty1 = Math.min(height, Math.ceil(expectedY + half));
        const retryVisited = new Uint8Array(width * height);
        detected = findBestFiducialBlob(
          dark,
          retryVisited,
          width,
          tx0,
          ty0,
          tx1,
          ty1,
          expectedAreaPx,
          expectedX,
          expectedY,
          maxDistPx,
          params
        );
      }

      if (!detected) continue;

      srcPts.push([expectedX, expectedY]);
      dstPts.push([detected.x, detected.y]);
      fiducialsFound++;
      fiducialCorners.push(corner);
    }

    let H: Homography | null = null;
    if (fiducialsFound >= 4) {
      H = buildHomography4(srcPts.slice(0, 4), dstPts.slice(0, 4));
    } else if (fiducialsFound === 3) {
      H = buildAffine3(srcPts, dstPts);
    }

    const alignmentFailed = H === null;

    let alignmentUncertain = false;
    let residualFraction: number | undefined;
    let ratioDiffStat: number | undefined;
    let angleDegStat: number | undefined;
    if (!alignmentFailed && H) {
      if (fiducialsFound === 3) {
        alignmentUncertain = true;
      } else if (fiducialsFound >= 4) {
        const affine = buildAffine3(srcPts.slice(0, 3), dstPts.slice(0, 3));
        if (!affine) {
          alignmentUncertain = true;
        } else {
          const [mX, mY] = transformPoint(affine, srcPts[3][0], srcPts[3][1]);
          const residual = Math.hypot(mX - dstPts[3][0], mY - dstPts[3][1]);
          residualFraction = width > 0 ? residual / width : undefined;
          if (residual > params.alignResidualFraction * width) {
            alignmentUncertain = true;
          }
        }

        // Map template page's corners through H
        const expW = pageTemplate.pageWidthPt * scanScale;
        const expH = pageTemplate.pageHeightPt * scanScale;
        const cTL = transformPoint(H, 0, 0);
        const cTR = transformPoint(H, expW, 0);
        const cBR = transformPoint(H, expW, expH);
        const cBL = transformPoint(H, 0, expH);

        const vTop: [number, number] = [cTR[0] - cTL[0], cTR[1] - cTL[1]];
        const vBottom: [number, number] = [cBR[0] - cBL[0], cBR[1] - cBL[1]];
        const vLeft: [number, number] = [cBL[0] - cTL[0], cBL[1] - cTL[1]];
        const vRight: [number, number] = [cBR[0] - cTR[0], cBR[1] - cTR[1]];

        const topLen = Math.hypot(vTop[0], vTop[1]);
        const bottomLen = Math.hypot(vBottom[0], vBottom[1]);
        const leftLen = Math.hypot(vLeft[0], vLeft[1]);
        const rightLen = Math.hypot(vRight[0], vRight[1]);

        const mappedW = (topLen + bottomLen) / 2;
        const mappedH = (leftLen + rightLen) / 2;

        if (mappedW <= 0 || mappedH <= 0 || width <= 0 || height <= 0) {
          alignmentUncertain = true;
        } else {
          // A correct registration maps the page onto the scan without distorting its
          // aspect ratio. Compare against the page itself, not the scan image — a
          // scanner bed larger than the sheet changes the image's ratio, not the page's.
          const mappedRatio = mappedW / mappedH;
          const pageRatio = expW / expH;
          const ratioDiff = Math.abs(mappedRatio - pageRatio) / pageRatio;
          ratioDiffStat = ratioDiff;
          if (ratioDiff > params.alignRatioTolerance) {
            alignmentUncertain = true;
          }

          if (topLen > 0 && leftLen > 0) {
            const dot = vTop[0] * vLeft[0] + vTop[1] * vLeft[1];
            const cosAngle = Math.max(-1, Math.min(1, dot / (topLen * leftLen)));
            const angleDeg = (Math.acos(cosAngle) * 180) / Math.PI;
            angleDegStat = angleDeg;
            if (Math.abs(angleDeg - 90) > params.alignAngleToleranceDeg) {
              alignmentUncertain = true;
            }
          } else {
            alignmentUncertain = true;
          }
        }
      }
    }

    const byExercise = new Map<string, OmrPageTemplate['bubbles']>();
    for (const bubble of pageTemplate.bubbles) {
      const list = byExercise.get(bubble.exerciseId) ?? [];
      list.push(bubble);
      byExercise.set(bubble.exerciseId, list);
    }

    const answerKeyById = new Map(answerKeys.map((k) => [k.exerciseId, k]));
    const results: OmrExerciseResult[] = [];

    for (const [exerciseId, bubbleRects] of byExercise) {
      const answerKey = answerKeyById.get(exerciseId);
      bubbleRects.sort((a, b) => a.optionIndex - b.optionIndex);

      if (alignmentFailed || !H) {
        results.push({
          exerciseId,
          pageIndex: pageTemplate.pageIndex,
          selectedOptions: [],
          score: 0,
          confidence: 'failed',
          flaggedOptions: [],
          bubbles: bubbleRects.map((b) => ({
            optionIndex: b.optionIndex,
            fillRatio: 0,
            state: 'blank' as const,
            rect: [0, 0, 0, 0],
          })),
        });
        continue;
      }

      // Pass 1: measure every box both ways — v4 (local threshold, border snapping, strokes) and
      // v2 (global Otsu, template rect). Spill needs every sibling's ring before classifying.
      const measured = bubbleRects.map((b) => {
        const bbox = bubbleBBoxInImage(H, b.rect, scanScale, pageTemplate.pageHeightPt);
        const redoBbox = b.redoRect
          ? bubbleBBoxInImage(H, effectiveRedoRect(b.rect, b.redoRect), scanScale, pageTemplate.pageHeightPt)
          : undefined;
        const cells = cellFills(dark, width, height, bbox, params.sampleInsetFraction);
        const maxCell = Math.max(...cells);
        return {
          b,
          bbox,
          m: measureBox(gray, width, height, bbox, redoBbox, blackRef, params),
          v2: {
            fill: sampleFillRatio(dark, width, height, bbox, params.sampleInsetFraction),
            redoRatio: redoBbox ? sampleFillRatio(dark, width, height, redoBbox, params.sampleInsetFraction) : undefined,
            minCellFill: Math.min(...cells),
            cellEvenness: maxCell > 0 ? Math.min(...cells) / maxCell : 0,
            ringFill: ringFill(dark, width, height, bbox, params.ringFraction, redoBbox),
            inkContrast: inkContrast(gray, dark, width, height, bbox, params.sampleInsetFraction, threshold, blackRef),
          },
        };
      });

      const bubbleReadings: OmrBubbleReading[] = measured.map(({ b, bbox: rawBbox, m, v2 }, i) => {
        const others = measured.filter((_, j) => j !== i);
        const spill = (own: number, rings: number[]) => (rings.length > 0 ? { spillExcess: own - median(rings) } : {});
        const shape: OmrShapeFeatures = {
          ...m.features,
          ...spill(m.features.ringFill, others.map((o) => o.m.features.ringFill)),
        };
        const dec4 = classifyV4({ fill: m.fill, redoRatio: m.redoRatio, features: shape }, params);
        const dec2 = classifyV2(
          {
            fill: v2.fill,
            redoRatio: v2.redoRatio,
            features: {
              minCellFill: v2.minCellFill,
              cellEvenness: v2.cellEvenness,
              ringFill: v2.ringFill,
              ...spill(v2.ringFill, others.map((o) => o.v2.ringFill)),
              inkContrast: v2.inkContrast,
            },
          },
          params
        );
        const [chosen, other, otherAlgorithm]: [OmrBubbleClassification, OmrBubbleClassification, number] =
          params.algorithm === 4 ? [dec4, dec2, 2] : [dec2, dec4, 4];
        const { state, reasons, provisional } = chosen;
        // Raw readings are the v4 measurements (features for calibration/training), whichever
        // algorithm decided.
        const ratio = m.fill;
        const redoRatio = m.redoRatio;

        // Report the box where the printed border actually is (snapped), not the raw template
        // position — the viewer's overlay and any crop then sit on the real box.
        const w = rawBbox.maxX - rawBbox.minX;
        const h = rawBbox.maxY - rawBbox.minY;
        const bbox = {
          minX: rawBbox.minX + shape.snapDx * w,
          maxX: rawBbox.maxX + shape.snapDx * w,
          minY: rawBbox.minY + shape.snapDy * h,
          maxY: rawBbox.maxY + shape.snapDy * h,
        };
        const rect: [number, number, number, number] = [
          Math.min(1, Math.max(0, bbox.minX / width)),
          Math.min(1, Math.max(0, bbox.minY / height)),
          Math.min(1, Math.max(0, bbox.maxX / width)),
          Math.min(1, Math.max(0, bbox.maxY / height)),
        ];
        return {
          optionIndex: b.optionIndex,
          fillRatio: ratio,
          redoRatio,
          state,
          shape,
          ...(reasons.length > 0 ? { reasons } : {}),
          ...(provisional !== undefined ? { provisional } : {}),
          alt: {
            algorithm: otherAlgorithm,
            state: other.state,
            ...(other.reasons.length > 0 ? { reasons: other.reasons } : {}),
            ...(other.provisional !== undefined ? { provisional: other.provisional } : {}),
          },
          rect,
        };
      });

      // An ambiguous box counts by its provisional (closer) reading until a teacher verifies it.
      const selectedOptions = bubbleReadings
        .filter((r) => r.state === 'marked' || r.state === 'redone' || (r.state === 'ambiguous' && r.provisional !== false))
        .map((r) => r.optionIndex);
      // A shape reason flags the box even when it was resolved (e.g. solid → undone): the
      // detector changed or doubted the fill-ratio reading, so a human confirms it.
      const flaggedOptions = bubbleReadings
        .filter((r) => r.state === 'ambiguous' || (r.reasons?.length ?? 0) > 0)
        .map((r) => r.optionIndex);

      const questionType = answerKey?.questionType ?? 'mc';
      const isSingleAnswerMultiMark =
        (questionType === 'sc' || questionType === 'tf') && selectedOptions.length > 1;

      const rawConfidence: 'high' | 'ambiguous' | 'failed' =
        flaggedOptions.length > 0 || isSingleAnswerMultiMark ? 'ambiguous' : 'high';
      const confidence: 'high' | 'ambiguous' | 'failed' =
        alignmentUncertain && rawConfidence === 'high' ? 'ambiguous' : rawConfidence;

      const score = answerKey
        ? computeMcScore(
            answerKey.questionType,
            selectedOptions,
            answerKey.correctAnswers,
            answerKey.penalty,
            answerKey.maxPoints
          )
        : 0;

      results.push({
        exerciseId,
        pageIndex: pageTemplate.pageIndex,
        selectedOptions,
        score,
        confidence,
        flaggedOptions,
        bubbles: bubbleReadings,
        ...(alignmentUncertain ? { alignmentUncertain: true } : {}),
      });
    }

    self.postMessage({
      type: 'OMR_RESULT',
      results,
      alignmentFailed,
      alignmentUncertain,
      fiducialsFound,
      fiducialCorners,
      pageStats: {
        otsuThreshold: threshold,
        fiducialsFound,
        fiducialCorners,
        ...(residualFraction !== undefined ? { residualFraction } : {}),
        ...(ratioDiffStat !== undefined ? { ratioDiff: ratioDiffStat } : {}),
        ...(angleDegStat !== undefined ? { angleDeg: angleDegStat } : {}),
      },
    });
  } catch (err: any) {
    self.postMessage({ type: 'ERROR', message: err.message || 'OMR processing failed' });
  }
};
