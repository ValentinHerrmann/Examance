/** Scan-to-template registration shared by the OMR worker and the score-box overlay (issue #187): Otsu binarization, corner-fiducial search, homography (4-point DLT, 3-point affine fallback). */

import type { OmrFiducialRect, OmrPageTemplate } from '#lib/db/schema';
import type { OmrDetectionParams } from '#lib/grading/omrSettings';

export type Homography = [number, number, number, number, number, number, number, number, number];

export function grayHistogram(gray: Uint8ClampedArray): number[] {
  const hist = new Array<number>(256).fill(0);
  for (const g of gray) hist[g]++;
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

/** Row at or below `col` with the largest magnitude in column `col`. */
function pivotRow(augmented: number[][], col: number): number {
  let pivot = col;
  for (let r = col + 1; r < augmented.length; r++) {
    if (Math.abs(augmented[r][col]) > Math.abs(augmented[pivot][col])) pivot = r;
  }
  return pivot;
}

/** Clears column `col` in every row but the pivot row. */
function eliminateColumn(augmented: number[][], col: number) {
  const n = augmented.length;
  for (let r = 0; r < n; r++) {
    if (r === col) continue;
    const factor = augmented[r][col] / augmented[col][col];
    for (let c = col; c <= n; c++) augmented[r][c] -= factor * augmented[col][c];
  }
}

/** Gaussian elimination with partial pivoting. Returns null if the system is singular. */
function solveLinearSystem(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const augmented = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    const pivot = pivotRow(augmented, col);
    if (Math.abs(augmented[pivot][col]) < 1e-10) return null;
    [augmented[col], augmented[pivot]] = [augmented[pivot], augmented[col]];
    eliminateColumn(augmented, col);
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

/** Where to look for one fiducial and what it should look like. */
interface FiducialSearch {
  dark: Uint8Array;
  visited: Uint8Array;
  width: number;
  /** Search window [x0, y0, x1, y1). */
  box: [number, number, number, number];
  expectedAreaPx: number;
  expectedX: number;
  expectedY: number;
  maxDistPx: number;
  params: OmrDetectionParams;
}

interface Blob {
  area: number;
  sumX: number;
  sumY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Flood-fills the 4-connected dark blob containing `start` inside the window, marking it visited. */
function floodFillBlob(s: FiducialSearch, start: number): Blob {
  const { dark, visited, width } = s;
  const [qx0, qy0, qx1, qy1] = s.box;
  const sx = start % width;
  const sy = Math.floor(start / width);
  const blob: Blob = { area: 0, sumX: 0, sumY: 0, minX: sx, maxX: sx, minY: sy, maxY: sy };
  const stack = [start];
  visited[start] = 1;
  while (stack.length > 0) {
    const cur = stack.pop() as number;
    const cy = Math.floor(cur / width);
    const cx = cur - cy * width;
    blob.area++;
    blob.sumX += cx;
    blob.sumY += cy;
    blob.minX = Math.min(blob.minX, cx);
    blob.maxX = Math.max(blob.maxX, cx);
    blob.minY = Math.min(blob.minY, cy);
    blob.maxY = Math.max(blob.maxY, cy);
    for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
      if (nx < qx0 || nx >= qx1 || ny < qy0 || ny >= qy1) continue;
      const nidx = ny * width + nx;
      if (!visited[nidx] && dark[nidx]) {
        visited[nidx] = 1;
        stack.push(nidx);
      }
    }
  }
  return blob;
}

/** The blob's centroid and its distance from the expected position, or null when its area, aspect or distance rule it out. */
function fiducialCandidate(s: FiducialSearch, b: Blob): { x: number; y: number; dist: number } | null {
  const p = s.params;
  const minArea = Math.max(9, s.expectedAreaPx * p.fiducialAreaMinRatio);
  const maxArea = s.expectedAreaPx * p.fiducialAreaMaxRatio;
  if (b.area < minArea || b.area > maxArea) return null;
  const bw = b.maxX - b.minX + 1;
  const bh = b.maxY - b.minY + 1;
  if (Math.max(bw, bh) / Math.max(1, Math.min(bw, bh)) > p.fiducialMaxAspectRatio) return null;
  const x = b.sumX / b.area;
  const y = b.sumY / b.area;
  const dist = Math.hypot(x - s.expectedX, y - s.expectedY);
  return dist > s.maxDistPx ? null : { x, y, dist };
}

/** Finds the connected dark blob in the search window that best matches a fiducial, scored by proximity to the template-expected position rather than area: a logo or student QR in the same quadrant is often the largest blob but is filtered out by the area/aspect checks. */
function findBestFiducialBlob(s: FiducialSearch): { x: number; y: number } | null {
  const [qx0, qy0, qx1, qy1] = s.box;
  let best: { x: number; y: number; dist: number } | null = null;
  for (let y = qy0; y < qy1; y++) {
    for (let x = qx0; x < qx1; x++) {
      const idx = y * s.width + x;
      if (s.visited[idx] || !s.dark[idx]) continue;
      const candidate = fiducialCandidate(s, floodFillBlob(s, idx));
      if (candidate && (!best || candidate.dist < best.dist)) best = candidate;
    }
  }
  return best ? { x: best.x, y: best.y } : null;
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

/** Searches one corner's fiducial in its quadrant, then in a tight window around the expected spot (e.g. when it merged with nearby content). Returns its expected and detected pixel position. */
function locateFiducial(
  corner: 0 | 1 | 2 | 3,
  template: OmrFiducialRect,
  scan: { dark: Uint8Array; visited: Uint8Array; width: number; height: number },
  pageHeightPt: number,
  scanScale: number,
  params: OmrDetectionParams
): { expected: [number, number]; detected: [number, number] } | null {
  const { dark, visited, width, height } = scan;
  const [rx0, ry0, rx1, ry1] = template.rect;
  const [expectedX, expectedY] = pdfPointToExpectedPixel((rx0 + rx1) / 2, (ry0 + ry1) / 2, scanScale, pageHeightPt);
  const sizePt = (rx1 - rx0 + (ry1 - ry0)) / 2;
  const expectedAreaPx = Math.pow(sizePt * scanScale, 2);
  const search: FiducialSearch = {
    dark,
    visited,
    width,
    box: quadrantForCorner(corner, width, height, params.quadrantFraction),
    expectedAreaPx,
    expectedX,
    expectedY,
    maxDistPx: params.fiducialMaxDistFraction * Math.min(width, height),
    params,
  };
  let detected = findBestFiducialBlob(search);
  if (!detected) {
    const half = Math.ceil(Math.sqrt(expectedAreaPx) * 1.5);
    const box: [number, number, number, number] = [
      Math.max(0, Math.floor(expectedX - half)),
      Math.max(0, Math.floor(expectedY - half)),
      Math.min(width, Math.ceil(expectedX + half)),
      Math.min(height, Math.ceil(expectedY + half)),
    ];
    detected = findBestFiducialBlob({ ...search, box, visited: new Uint8Array(width * height) });
  }
  return detected ? { expected: [expectedX, expectedY], detected: [detected.x, detected.y] } : null;
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
    const found = locateFiducial(corner, template, { dark, visited, width, height }, pageTemplate.pageHeightPt, scanScale, params);
    if (!found) continue;
    srcPts.push(found.expected);
    dstPts.push(found.detected);
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
