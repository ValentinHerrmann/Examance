/** OMR auto-grading overlay drawing — shared by the live grading canvas (ScanCanvasViewer.svelte) and the graded-PDF export (routes/exam/[id]/scan/+page.svelte) so both render the exact same annotations from the same data. */

import type { ExerciseRecord, OmrScoreMeta } from '#lib/db/schema';

export interface McOverlayState {
  omrMeta?: OmrScoreMeta;
}

/** Shared by the manual `check_full`/`check` stroke tool and the OMR pass below. */
export function drawCheckmark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size = 30,
  lineWidth?: number
) {
  if (lineWidth !== undefined) {
    ctx.lineWidth = lineWidth;
  } else if (size !== 30) {
    ctx.lineWidth = Math.max(1.5, size * 0.08);
  }
  const s = size / 30;
  ctx.beginPath();
  ctx.moveTo(x - 14 * s, y - 2 * s);
  ctx.lineTo(x - 4 * s, y + 10 * s);
  ctx.lineTo(x + 16 * s, y - 18 * s);
  ctx.stroke();
}

/** Shared by the manual `missing` stroke tool and the OMR pass below. */
export function drawMissingSymbol(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size = 30,
  lineWidth?: number
) {
  if (lineWidth !== undefined) {
    ctx.lineWidth = lineWidth;
  } else if (size !== 30) {
    ctx.lineWidth = Math.max(1.5, size * 0.08);
  }
  const s = size / 30;
  ctx.beginPath();
  ctx.moveTo(x - 12 * s, y - 18 * s);
  ctx.lineTo(x, y + 4 * s);
  ctx.lineTo(x + 12 * s, y - 18 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 15 * s, y - 8 * s);
  ctx.lineTo(x + 15 * s, y - 8 * s);
  ctx.stroke();
}

export function drawScoreText(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  fontSize?: number
) {
  const size = fontSize !== undefined ? Math.round(fontSize) : 26;
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

/** Unsigned point formatting matching the comma-decimal convention of `formatSignedScore`. */
export function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
}

/** Formats a penalty magnitude like the manual `minus_full`/`minus_half`/`minus_quarter` stamps ("-1", "-0,5", "-0,25") so OMR-derived stamps read consistently with them. */
export function formatSignedScore(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  const magnitude = Math.abs(value);
  const text = Number.isInteger(magnitude) ? String(magnitude) : String(magnitude).replace('.', ',');
  return `${sign}${text}`;
}

/** What `drawOmrOverlayForPage` stamps next to the boxes: the sub-exercise letters of MC groups and the scores they show. */
export interface OmrOverlayStamps {
  subExerciseLetters: Map<string, string>;
  scoreInputs: Record<string, number | null | undefined>;
}

/** Pixel geometry of one detected box on the page raster. */
interface BoxGeometry {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  boxPx: number;
  strokeWidth: number;
  pad: number;
  /** Right-hand stamps sit raised by half a box, so they clear the option text that follows the box on the same line (still beside the box, never over it). */
  stampY: number;
  isCorrectOption: boolean;
}

function strokeFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  g: BoxGeometry,
  pad: number,
  style: { alpha: number; color: string; dash: number[] }
) {
  ctx.save();
  ctx.globalAlpha = style.alpha;
  ctx.strokeStyle = style.color;
  ctx.lineWidth = g.strokeWidth;
  ctx.setLineDash(style.dash);
  ctx.strokeRect(g.x0 * w - pad, g.y0 * h - pad, (g.x1 - g.x0) * w + 2 * pad, (g.y1 - g.y0) * h + 2 * pad);
  ctx.restore();
}

/** Stamps a red "missing" symbol beside the box when it is a correct option the student left unticked. */
function drawMissingStamp(ctx: CanvasRenderingContext2D, w: number, g: BoxGeometry) {
  if (!g.isCorrectOption) return;
  ctx.save();
  ctx.strokeStyle = '#ef4444';
  ctx.fillStyle = '#ef4444';
  ctx.lineWidth = g.strokeWidth;
  drawMissingSymbol(ctx, g.x1 * w + g.boxPx * 0.9, g.stampY, g.boxPx, g.strokeWidth);
  ctx.restore();
}

/** Check mark for a ticked correct option, the penalty for a ticked wrong one. */
function drawMarkedStamp(ctx: CanvasRenderingContext2D, w: number, g: BoxGeometry, penalty: number) {
  ctx.save();
  ctx.strokeStyle = '#ef4444';
  ctx.fillStyle = '#ef4444';
  if (g.isCorrectOption) {
    ctx.lineWidth = g.strokeWidth;
    drawCheckmark(ctx, g.x1 * w + g.boxPx * 0.9, g.stampY, g.boxPx, g.strokeWidth);
  } else {
    const textX = g.x1 * w + g.boxPx * 0.3;
    const fontSize = Math.max(10, g.boxPx * 0.7);
    drawScoreText(ctx, textX, g.stampY, formatSignedScore(-Math.abs(penalty)), fontSize);
  }
  ctx.restore();
}

/** Per-exercise inputs of the box pass. */
interface BubblePass {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  correctAnswers: Set<number>;
  reviewed: boolean;
  flagged: Set<number>;
  penalty: number;
}

function drawBubble(pass: BubblePass, bubble: NonNullable<OmrScoreMeta['detections']>['bubbles'][number]) {
  const { ctx, w, h } = pass;
  const [x0, y0, x1, y1] = bubble.rect;
  const boxPx = (x1 - x0) * w;
  const g: BoxGeometry = {
    x0,
    y0,
    x1,
    y1,
    boxPx,
    strokeWidth: Math.max(1.5, boxPx * 0.08),
    pad: boxPx * 0.25,
    stampY: ((y0 + y1) / 2) * h - boxPx * 0.5,
    isCorrectOption: pass.correctAnswers.has(bubble.optionIndex),
  };

  const unsure =
    !pass.reviewed &&
    (bubble.detectedState === 'ambiguous' || bubble.state === 'ambiguous' || pass.flagged.has(bubble.optionIndex));
  if (unsure) {
    // Wider than the red/grey frames, so it stays visible around them.
    strokeFrame(ctx, w, h, g, g.pad * 1.6, { alpha: 0.8, color: '#f59e0b', dash: [6, 4] });
  }

  if (bubble.state === 'blank' || bubble.state === 'undone') {
    // slate-500 — visually distinct from amber "ambiguous"
    if (bubble.state === 'undone') strokeFrame(ctx, w, h, g, g.pad, { alpha: 0.7, color: '#64748b', dash: [2, 3] });
    drawMissingStamp(ctx, w, g);
    return;
  }

  const marked = bubble.state === 'marked' || bubble.state === 'redone';
  if (marked || !unsure) {
    strokeFrame(ctx, w, h, g, g.pad, { alpha: 0.7, color: marked ? '#ef4444' : '#f59e0b', dash: marked ? [] : [6, 4] });
  }

  if (bubble.state === 'redone') {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = g.strokeWidth;
    ctx.strokeRect((x0 - (x1 - x0) * 0.9) * w, y0 * h, (x1 - x0) * 0.8 * w, (y1 - y0) * h);
    ctx.restore();
  }

  // An unverified ambiguous box whose provisional (closer) reading is "not ticked": keep the orange frame, but score it like a blank box.
  if (bubble.state === 'ambiguous' && bubble.provisional === false) {
    drawMissingStamp(ctx, w, g);
    return;
  }

  drawMarkedStamp(ctx, w, g, pass.penalty);
}

/** Running total left of an MC group member's boxes, e.g. "b) 1,5/2". */
function drawGroupTotal(
  ctx: CanvasRenderingContext2D,
  text: string,
  bboxMinX: number,
  bboxMinY: number,
  bboxMaxY: number
) {
  const cy = (bboxMinY + bboxMaxY) / 2;
  ctx.save();
  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bboxMinX - 8, cy);
  ctx.restore();
}

/** Draws OMR-derived annotations over every MC/SC/TF exercise on one page, as a non-persisted overlay separate from manual strokes. Rects are normalized [minX,minY,maxX,maxY] in [0,1] (omrWorker.ts), so `w`/`h` are the raster's pixel size. Boxes: red solid = marked, amber dashed = ambiguous; plus score/`missing` stamps and a running total per MC group. */
export function drawOmrOverlayForPage(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  currentPage: number,
  mcState: Record<string, McOverlayState>,
  exercises: ExerciseRecord[],
  { subExerciseLetters, scoreInputs }: OmrOverlayStamps
) {
  for (const [exerciseId, state] of Object.entries(mcState)) {
    const detections = state.omrMeta?.detections;
    if (!detections || detections.pageIndex + 1 !== currentPage) continue;

    const exercise = exercises.find((ex) => ex.id === exerciseId);
    const pass: BubblePass = {
      ctx,
      w,
      h,
      correctAnswers: new Set(exercise?.correctAnswers ?? []),
      // "Unsure" is the detector's verdict and lasts until a teacher verifies the question. It must not follow `bubble.state`: the review builders rewrite that to marked/blank on the first click. (Same rule as isMcReviewed in mcVerification.ts — not imported: that module pulls in the DB.)
      reviewed: state.omrMeta?.source === 'manual' || !!state.omrMeta?.reviewedAt,
      flagged: new Set(state.omrMeta?.flaggedOptions ?? []),
      penalty: exercise?.penalty ?? 0,
    };

    let bboxMinX = Infinity;
    let bboxMinY = Infinity;
    let bboxMaxY = -Infinity;

    for (const bubble of detections.bubbles) {
      const [x0, y0, , y1] = bubble.rect;
      bboxMinX = Math.min(bboxMinX, x0 * w);
      bboxMinY = Math.min(bboxMinY, y0 * h);
      bboxMaxY = Math.max(bboxMaxY, y1 * h);
      drawBubble(pass, bubble);
    }

    const letter = subExerciseLetters.get(exerciseId);
    if (letter && exercise && bboxMinX !== Infinity) {
      const achieved = scoreInputs[exerciseId] ?? 0;
      const text = `${letter}) ${formatPoints(achieved)}/${formatPoints(exercise.maxPoints)}`;
      drawGroupTotal(ctx, text, bboxMinX, bboxMinY, bboxMaxY);
    }
  }
}
