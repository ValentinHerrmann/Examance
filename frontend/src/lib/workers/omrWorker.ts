/**
 * Web Worker for Optical Mark Recognition (OMR) & Fiducial Marker Alignment.
 *
 * Pipeline: binarize (Otsu) -> locate the 4 corner fiducials by largest dark
 * blob per quadrant -> homography (4-point DLT, 3-point affine fallback) ->
 * sample each template bubble's fill ratio through the transform -> score via
 * the shared mcScore.ts so this worker and the manual review UI never disagree.
 *
 * No OpenCV.js — bubble positions come from the compiled PDF's `omr://` link
 * annotations (captured once per exam by "Prepare OMR"), not computer vision.
 * Only the 4 fiducials are actually detected in pixel space.
 */

import type { OmrFiducialRect, OmrPageTemplate } from '$lib/db/schema';
import { computeMcScore, type McQuestionType } from '$lib/grading/mcScore';

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
}

export interface OmrBubbleReading {
  optionIndex: number;
  fillRatio: number;
  state: 'blank' | 'ambiguous' | 'marked' | 'undone' | 'redone';
  /** Redo-zone fill ratio, only computed when the bubble's template has a redoRect. */
  redoRatio?: number;
  /** Bubble's bbox in scan-pixel space, normalized to [0,1] of (width, height) as
   *  [minX, minY, maxX, maxY] — resolution-independent so the grading viewer (which
   *  re-rasterizes at its own scale) can draw a detection box without knowing this
   *  worker's pixel dimensions. [0,0,0,0] when alignment failed (unused: `state` is
   *  always 'blank' in that case, so nothing gets drawn). */
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
}

export type OmrWorkerResponse =
  | {
      type: 'OMR_RESULT';
      results: OmrExerciseResult[];
      alignmentFailed: boolean;
      fiducialsFound: number;
      /** Corner indices (0=BL,1=BR,2=TR,3=TL) actually detected this pass — lets a
       *  caller report exactly which corner is missing instead of just a count. */
      fiducialCorners: number[];
    }
  | { type: 'ERROR'; message: string };

/** Fill-ratio confidence bands: below is blank, above is a confident mark. */
const AMBIGUOUS_LOW = 0.15;
const MARKED_HIGH = 0.45;

/** At/above this, the box is essentially solid black — treated as "undo" rather than a cross,
 *  but only for bubbles whose template has a redoRect (see bubbleState below). */
const FILLED_HIGH = 0.75;

/** Fraction of each side of the page searched for a corner's fiducial. */
const QUADRANT_FRACTION = 0.4;

/** Fraction of a sampled bubble's bounding box trimmed off each edge before counting fill. */
const SAMPLE_INSET_FRACTION = 0.12;

/** A candidate blob's area must fall within this multiple range of the fiducial's
 *  expected area (from the template) to be considered — rejects small noise and
 *  large fills (e.g. a scanned page-edge shadow) without depending on being the
 *  single largest blob in the quadrant. */
const FIDUCIAL_AREA_MIN_RATIO = 0.3;
const FIDUCIAL_AREA_MAX_RATIO = 3.0;

/** A fiducial is a square marker — reject blobs whose bbox is far from square
 *  (rules, table borders, text runs, a logo silhouette). */
const FIDUCIAL_MAX_ASPECT_RATIO = 1.8;

/** How far (as a fraction of the page's shorter side) a candidate blob's centroid
 *  may sit from the template-expected position and still count as that corner's
 *  fiducial — keeps a same-quadrant logo/QR code from being picked over a
 *  genuinely shifted/skewed marker. */
const FIDUCIAL_MAX_DIST_FRACTION = 0.15;

type Homography = [number, number, number, number, number, number, number, number, number];

/** Grayscale (luminance) Otsu threshold — histogram + between-class variance maximization. */
function computeOtsuThreshold(gray: Uint8ClampedArray): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;

  const total = gray.length;
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
 * Finds the connected dark blob within [qx0,qx1) x [qy0,qy1) that best matches a fiducial
 * marker, scored by proximity to the template-expected position rather than raw area — a
 * page logo or the student QR code sitting in the same quadrant is typically the *largest*
 * blob but rarely the *closest* one to where the marker is supposed to be, and gets filtered
 * out entirely by the area-tolerance and aspect-ratio checks before distance is even
 * considered.
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
  maxDistPx: number
): { x: number; y: number } | null {
  const minArea = Math.max(9, expectedAreaPx * FIDUCIAL_AREA_MIN_RATIO);
  const maxArea = expectedAreaPx * FIDUCIAL_AREA_MAX_RATIO;

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
      if (aspect > FIDUCIAL_MAX_ASPECT_RATIO) continue;

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
  height: number
): [number, number, number, number] {
  const qw = Math.floor(width * QUADRANT_FRACTION);
  const qh = Math.floor(height * QUADRANT_FRACTION);
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

function sampleFillRatio(
  dark: Uint8Array,
  width: number,
  height: number,
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
): number {
  const insetX = (bbox.maxX - bbox.minX) * SAMPLE_INSET_FRACTION;
  const insetY = (bbox.maxY - bbox.minY) * SAMPLE_INSET_FRACTION;
  const x0 = Math.max(0, Math.round(bbox.minX + insetX));
  const x1 = Math.min(width, Math.round(bbox.maxX - insetX));
  const y0 = Math.max(0, Math.round(bbox.minY + insetY));
  const y1 = Math.min(height, Math.round(bbox.maxY - insetY));

  let darkCount = 0;
  let total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      total++;
      if (dark[y * width + x]) darkCount++;
    }
  }
  return total > 0 ? darkCount / total : 0;
}

function bubbleState(
  ratio: number,
  redoRatio: number | undefined
): 'blank' | 'ambiguous' | 'marked' | 'undone' | 'redone' {
  if (ratio < AMBIGUOUS_LOW) return 'blank';
  if (ratio < MARKED_HIGH) return 'ambiguous';
  if (redoRatio === undefined || ratio < FILLED_HIGH) return 'marked';
  // Solid fill + template has a redo zone: undone unless the redo zone itself is marked.
  return redoRatio >= MARKED_HIGH ? 'redone' : 'undone';
}

self.onmessage = (event: MessageEvent<OmrWorkerRequest>) => {
  const { imageData, pageTemplate, scanScale, answerKeys } = event.data;
  try {
    const { width, height, data } = imageData;

    const gray = new Uint8ClampedArray(width * height);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    const threshold = computeOtsuThreshold(gray);
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
      const maxDistPx = FIDUCIAL_MAX_DIST_FRACTION * Math.min(width, height);

      const [qx0, qy0, qx1, qy1] = quadrantForCorner(corner, width, height);
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
        maxDistPx
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
          maxDistPx
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

      const bubbleReadings: OmrBubbleReading[] = bubbleRects.map((b) => {
        const bbox = bubbleBBoxInImage(H, b.rect, scanScale, pageTemplate.pageHeightPt);
        const ratio = sampleFillRatio(dark, width, height, bbox);

        let redoRatio: number | undefined;
        if (b.redoRect && ratio >= FILLED_HIGH) {
          const redoBbox = bubbleBBoxInImage(H, b.redoRect, scanScale, pageTemplate.pageHeightPt);
          redoRatio = sampleFillRatio(dark, width, height, redoBbox);
        } else if (b.redoRect) {
          redoRatio = 0;
        }

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
          state: bubbleState(ratio, redoRatio),
          rect,
        };
      });

      const selectedOptions = bubbleReadings
        .filter((r) => r.state !== 'blank' && r.state !== 'undone')
        .map((r) => r.optionIndex);
      const flaggedOptions = bubbleReadings
        .filter((r) => r.state === 'ambiguous')
        .map((r) => r.optionIndex);

      const questionType = answerKey?.questionType ?? 'mc';
      const isSingleAnswerMultiMark =
        (questionType === 'sc' || questionType === 'tf') && selectedOptions.length > 1;

      const confidence: 'high' | 'ambiguous' | 'failed' =
        flaggedOptions.length > 0 || isSingleAnswerMultiMark ? 'ambiguous' : 'high';

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
      });
    }

    self.postMessage({ type: 'OMR_RESULT', results, alignmentFailed, fiducialsFound, fiducialCorners });
  } catch (err: any) {
    self.postMessage({ type: 'ERROR', message: err.message || 'OMR processing failed' });
  }
};
