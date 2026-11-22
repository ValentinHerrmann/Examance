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

/** Crop of a legacy PNG scan, always on: its stored strokes are in cropped coordinates; the viewer and the PDF export share it so strokes line up. */
export function legacyScanCrop(img: HTMLImageElement): AutoCropBounds {
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

// Scratch-out (issue #330): canvas pixels at pdf.js scale 2.
const SCRATCH_STEP = 8; // resampling spacing, so pen jitter neither adds reversals nor turning
const SCRATCH_MIN_DIAG = 30; // a dot or a tiny tick never counts as a scribble
const SCRATCH_MIN_REVERSALS = 4; // five passes back and forth; a written W or M has three
const SCRATCH_MAX_NET_TURN = 0.5; // a zig-zag's turns cancel out; a circle or spiral turns one way
const SCRATCH_MIN_DENSITY = 3; // path length / bounding-box diagonal: the passes overlap, unlike written letters
const SCRATCH_MAX_SPREAD = 1.5; // extent across / along the passes: a written word runs across its strokes
const SCRATCH_PAD = 20; // distance to the scribble's path: covers the gap between two passes and about half a stamp
const SCRATCH_PEN_SHARE = 0.6; // a long mark merely crossed stays

/** The stroke's points about SCRATCH_STEP apart. */
function resample(points: Point[]): Point[] {
  const out = [points[0]];
  for (const p of points) {
    const last = out.at(-1)!;
    if (Math.hypot(p.x - last.x, p.y - last.y) >= SCRATCH_STEP) out.push(p);
  }
  return out;
}

/** Unit vector of the stroke's dominant drawing direction (segment orientations averaged by doubled angle, so back and forth adds up). */
function strokeAxis(points: Point[]): Point {
  let c = 0;
  let sn = 0;
  for (let i = 1; i < points.length; i++) {
    const a = 2 * Math.atan2(points[i].y - points[i - 1].y, points[i].x - points[i - 1].x);
    c += Math.cos(a);
    sn += Math.sin(a);
  }
  const angle = Math.atan2(sn, c) / 2;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function extentAlong(points: Point[], axis: Point): number {
  const proj = points.map((p) => p.x * axis.x + p.y * axis.y);
  return Math.max(...proj) - Math.min(...proj);
}

/** Times the stroke turns back along `axis`, counting only passes over at least a third of its extent. */
function countReversals(points: Point[], axis: Point): number {
  const proj = points.map((p) => p.x * axis.x + p.y * axis.y);
  const hysteresis = Math.max(SCRATCH_STEP, extentAlong(points, axis) / 3);
  let reversals = 0;
  let dir = 0;
  let extreme = proj[0];
  for (const v of proj) {
    if (dir === 0) {
      if (Math.abs(v - extreme) >= hysteresis) {
        dir = Math.sign(v - extreme);
        extreme = v;
      }
    } else if ((v - extreme) * dir > 0) {
      extreme = v;
    } else if ((extreme - v) * dir >= hysteresis) {
      reversals++;
      dir = -dir;
      extreme = v;
    }
  }
  return reversals;
}

/** |signed turning| / total turning: near 0 for a zig-zag, near 1 for a loop. */
function netTurnRatio(points: Point[]): number {
  let signed = 0;
  let total = 0;
  for (let i = 2; i < points.length; i++) {
    const a = Math.atan2(points[i - 1].y - points[i - 2].y, points[i - 1].x - points[i - 2].x);
    const b = Math.atan2(points[i].y - points[i - 1].y, points[i].x - points[i - 1].x);
    let turn = b - a;
    if (turn > Math.PI) turn -= 2 * Math.PI;
    if (turn < -Math.PI) turn += 2 * Math.PI;
    signed += turn;
    total += Math.abs(turn);
  }
  return total === 0 ? 1 : Math.abs(signed) / total;
}

function boundsOf(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

/** Whether a pen stroke is a back-and-forth scribble meant to erase what it covers (issue #330). */
export function isScratchOut(points: Point[]): boolean {
  if (points.length < 2) return false;
  const b = boundsOf(points);
  const diag = Math.hypot(b.maxX - b.minX, b.maxY - b.minY);
  const pts = resample(points);
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (diag < SCRATCH_MIN_DIAG || length < SCRATCH_MIN_DENSITY * diag) return false;
  const axis = strokeAxis(pts);
  if (extentAlong(pts, { x: -axis.y, y: axis.x }) > SCRATCH_MAX_SPREAD * extentAlong(pts, axis)) return false;
  return countReversals(pts, axis) >= SCRATCH_MIN_REVERSALS && netTurnRatio(pts) <= SCRATCH_MAX_NET_TURN;
}

/** The polyline with extra points so no two neighbours are more than SCRATCH_STEP apart (a line stores only its ends). */
function densify(points: Point[]): Point[] {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / SCRATCH_STEP);
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

function nearPath(p: Point, path: Point[]): boolean {
  if (path.length === 1) return Math.hypot(p.x - path[0].x, p.y - path[0].y) <= SCRATCH_PAD;
  for (let i = 1; i < path.length; i++) if (distanceToSegment(p, path[i - 1], path[i]) <= SCRATCH_PAD) return true;
  return false;
}

/** Strokes left after a scribble on `page` erased the marks near its own path (not its bounding box); null when it covered none. */
export function scratchOutStrokes(strokes: VectorStroke[], page: number, scribble: Point[]): VectorStroke[] | null {
  const path = resample(scribble);
  const covered = (s: VectorStroke): boolean => {
    if ((s.pageNumber ?? 1) !== page || s.points.length === 0) return false;
    if (s.tool !== 'pen' && s.tool !== 'line') return nearPath(s.points[0], path);
    const samples = densify(s.points);
    return samples.filter((p) => nearPath(p, path)).length >= SCRATCH_PEN_SHARE * samples.length;
  };
  const remaining = strokes.filter((s) => !covered(s));
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
