import type { GradingState, VectorStroke } from '#lib/grading/gradingStore';
import type { Point } from './pointerInput';

export interface AutoCropBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

const INK_LUMINANCE = 225;
const SAMPLE_STEP = 4;
const CROP_PAD = 20;

/** Bounding box of the dark (non-paper) pixels, sampled on a coarse grid; null when none. */
function findInkBounds(data: Uint8ClampedArray, width: number, height: number): AutoCropBounds | null {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y += SAMPLE_STEP) {
    for (let x = 0; x < width; x += SAMPLE_STEP) {
      const idx = (y * width + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      if (lum >= INK_LUMINANCE) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX <= minX || maxY <= minY) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function getAutoCropBounds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): AutoCropBounds {
  const full = { x: 0, y: 0, w: width, h: height };
  try {
    const ink = findInkBounds(ctx.getImageData(0, 0, width, height).data, width, height);
    if (!ink) return full;
    const x = Math.max(0, ink.x - CROP_PAD);
    const y = Math.max(0, ink.y - CROP_PAD);
    const w = Math.min(width - x, ink.w + CROP_PAD * 2);
    const h = Math.min(height - y, ink.h + CROP_PAD * 2);
    if (w < width * 0.95 || h < height * 0.95) return { x, y, w, h };
  } catch (e) {
    console.error("Auto crop calculation failed:", e);
  }
  return full;
}

/** Scans are sealed PDFs; legacy submissions hold a PNG. */
export function isPdfBytes(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

export async function decodePngBytes(bytes: Uint8Array): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/png' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Crop of a legacy PNG scan; the viewer and the PDF export share it so strokes line up. */
export function legacyScanCrop(img: HTMLImageElement, autoCrop: boolean): AutoCropBounds {
  if (!autoCrop) return { x: 0, y: 0, w: img.width, h: img.height };
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  return getAutoCropBounds(ctx, img.width, img.height);
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Shortest distance between segments ab and cd (0 when they cross). */
export function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b));
}

/** Whether the eraser's sweep from→to passes within `radius` of the stroke's path (a line stores only its two ends, issue #327). */
function strokeHit(points: Point[], from: Point, to: Point, radius: number): boolean {
  if (points.length === 1) return distanceToSegment(points[0], from, to) <= radius;
  for (let i = 1; i < points.length; i++) {
    if (segmentDistance(points[i - 1], points[i], from, to) <= radius) return true;
  }
  return false;
}

/** Strokes left after the eraser swept from `from` to `to` on `page`; null when nothing was hit. */
export function eraseStrokesAt(strokes: VectorStroke[], page: number, from: Point, to: Point = from, radius = 25): VectorStroke[] | null {
  const remaining = strokes.filter((s) => (s.pageNumber ?? 1) !== page || !strokeHit(s.points, from, to, radius));
  return remaining.length === strokes.length ? null : remaining;
}

/** A new stroke of the active tool at `point`. Stamps go to the active exercise (else the first) and its active part; lines and pen keep the active id as is. */
export function newStroke(
  state: Pick<GradingState, 'drawTool' | 'penColor' | 'activeExerciseId' | 'activePartLabel'>,
  exercises: { id: string }[],
  point: { x: number; y: number },
  page: number
): VectorStroke {
  const tool = state.drawTool;
  if (tool === 'pen' || tool === 'line') {
    return {
      tool,
      points: tool === 'line' ? [point, { ...point }] : [point],
      color: state.penColor,
      exerciseId: state.activeExerciseId || exercises[0]?.id,
      pageNumber: page,
    };
  }
  const target = exercises.find((ex) => ex.id === state.activeExerciseId) ?? exercises[0];
  return {
    tool,
    points: [point],
    color: '#ef4444',
    exerciseId: target?.id,
    partLabel: target?.id === state.activeExerciseId ? state.activePartLabel || undefined : undefined,
    pageNumber: page,
  };
}
