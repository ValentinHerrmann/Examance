/** Scan-to-template registration shared by the OMR worker and the score-box overlay (issue #187): Otsu binarization, corner-fiducial search, homography (4-point DLT, 3-point affine fallback). */

import type { OmrFiducialRect, OmrPageTemplate } from '#lib/db/schema';
import type { OmrDetectionParams } from '#lib/grading/omrSettings';

export type Homography = [number, number, number, number, number, number, number, number, number];

export function grayHistogram(gray: Uint8ClampedArray): number[] {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  return hist;
}

/** Grayscale (luminance) Otsu threshold — histogram + between-class variance maximization. */
export function computeOtsuThreshold(hist: number[], total: number): number {
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
export function buildAffine3(src: [number, number][], dst: [number, number][]): Homography | null {
  const A = src.map(([X, Y]) => [X, Y, 1]);
  const bx = dst.map(([x]) => x);
  const by = dst.map(([, y]) => y);
  const abc = solveLinearSystem(A, bx);
  const def = solveLinearSystem(A, by);
  if (!abc || !def) return null;
  return [abc[0], abc[1], abc[2], def[0], def[1], def[2], 0, 0, 1];
}

export function transformPoint(H: Homography, x: number, y: number): [number, number] {
  const [h11, h12, h13, h21, h22, h23, h31, h32, h33] = H;
  const w = h31 * x + h32 * y + h33;
  return [(h11 * x + h12 * y + h13) / w, (h21 * x + h22 * y + h23) / w];
}

/** Template point (PDF points, origin bottom-left) -> expected pixel at the scan's raster scale. */
export function pdfPointToExpectedPixel(
  px: number,
  py: number,
  scanScale: number,
  pageHeightPt: number
): [number, number] {
  return [px * scanScale, (pageHeightPt - py) * scanScale];
}

/** Finds the connected dark blob in [qx0,qx1) x [qy0,qy1) that best matches a fiducial, scored by proximity to the template-expected position rather than area: a logo or student QR in the same quadrant is often the largest blob but is filtered out by the area/aspect checks. */
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

export function bubbleBBoxInImage(
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

export interface PageRegistration {
  gray: Uint8ClampedArray;
  hist: number[];
  threshold: number;
  dark: Uint8Array;
  srcPts: [number, number][];
  dstPts: [number, number][];
  fiducialsFound: number;
  fiducialCorners: number[];
  /** Template pixel (at scanScale) -> scan pixel; null when fewer than 3 fiducials were found. */
  H: Homography | null;
}

/** Binarizes the scan and maps the template onto it through the corner fiducials. */
export function registerPage(
  imageData: ImageData,
  pageTemplate: OmrPageTemplate,
  scanScale: number,
  params: OmrDetectionParams
): PageRegistration {
  const { width, height, data } = imageData;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  const hist = grayHistogram(gray);
  const threshold = computeOtsuThreshold(hist, gray.length);
  const dark = new Uint8Array(width * height);
  for (let p = 0; p < gray.length; p++) dark[p] = gray[p] < threshold ? 1 : 0;

  // Locate each fiducial: expected position from the template, searched for in the corresponding quadrant of the actual scan (a scan can be shifted/skewed, not rotated past quadrant boundaries under normal handling).
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

  return { gray, hist, threshold, dark, srcPts, dstPts, fiducialsFound, fiducialCorners, H };
}

/** A PDF rect of the template as [minX, minY, maxX, maxY] normalized to [0,1] of the scan image. */
export function pdfRectToNormalized(
  H: Homography,
  rect: [number, number, number, number],
  scanScale: number,
  pageHeightPt: number,
  width: number,
  height: number
): [number, number, number, number] {
  const b = bubbleBBoxInImage(H, rect, scanScale, pageHeightPt);
  return [b.minX / width, b.minY / height, b.maxX / width, b.maxY / height];
}
