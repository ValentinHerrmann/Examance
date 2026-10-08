/**
 * OMR auto-grading overlay drawing — shared by the live grading canvas
 * (ScanCanvasViewer.svelte) and the graded-PDF export (routes/exam/[id]/scan/+page.svelte)
 * so both render the exact same annotations from the same data.
 */

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

/** Formats a penalty magnitude like the manual `minus_full`/`minus_half`/`minus_quarter`
 *  stamps ("-1", "-0,5", "-0,25") so OMR-derived stamps read consistently with them. */
export function formatSignedScore(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  const magnitude = Math.abs(value);
  const text = Number.isInteger(magnitude) ? String(magnitude) : String(magnitude).replace('.', ',');
  return `${sign}${text}`;
}

/**
 * Draws OMR-derived annotations over every MC/SC/TF exercise on one page, as a non-persisted overlay separate from manual
 * strokes. Rects are normalized [minX,minY,maxX,maxY] in [0,1] (omrWorker.ts), so `w`/`h` are the raster's pixel size.
 * Boxes: red solid = marked, amber dashed = ambiguous; plus score/`missing` stamps and a running total per MC group.
 */
export function drawOmrOverlayForPage(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  currentPage: number,
  mcState: Record<string, McOverlayState>,
  exercises: ExerciseRecord[],
  subExerciseLetters: Map<string, string>,
  scoreInputs: Record<string, number | null | undefined>
) {
  for (const [exerciseId, state] of Object.entries(mcState)) {
    const detections = state.omrMeta?.detections;
    if (!detections || detections.pageIndex + 1 !== currentPage) continue;

    const exercise = exercises.find((ex) => ex.id === exerciseId);
    const correctAnswers = new Set(exercise?.correctAnswers ?? []);
    // "Unsure" is the detector's verdict and lasts until a teacher verifies the question. It must
    // not follow `bubble.state`: the review builders rewrite that to marked/blank on the first click.
    // (Same rule as isMcReviewed in mcVerification.ts — not imported: that module pulls in the DB.)
    const reviewed = state.omrMeta?.source === 'manual' || !!state.omrMeta?.reviewedAt;
    const flagged = new Set(state.omrMeta?.flaggedOptions ?? []);
    const penalty = exercise?.penalty ?? 0;

    let bboxMinX = Infinity;
    let bboxMinY = Infinity;
    let bboxMaxY = -Infinity;

    for (const bubble of detections.bubbles) {
      const [x0, y0, x1, y1] = bubble.rect;
      const cy = ((y0 + y1) / 2) * h;
      const isCorrectOption = correctAnswers.has(bubble.optionIndex);
      const boxPx = (x1 - x0) * w;
      const strokeWidth = Math.max(1.5, boxPx * 0.08);
      const pad = boxPx * 0.25;
      // Right-hand stamps sit raised by half a box, so they clear the option text
      // that follows the box on the same line (still beside the box, never over it).
      const stampY = cy - boxPx * 0.5;

      bboxMinX = Math.min(bboxMinX, x0 * w);
      bboxMinY = Math.min(bboxMinY, y0 * h);
      bboxMaxY = Math.max(bboxMaxY, y1 * h);

      const unsure =
        !reviewed &&
        (bubble.detectedState === 'ambiguous' || bubble.state === 'ambiguous' || flagged.has(bubble.optionIndex));
      if (unsure) {
        // Wider than the red/grey frames, so it stays visible around them.
        const outerPad = pad * 1.6;
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = strokeWidth;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(x0 * w - outerPad, y0 * h - outerPad, (x1 - x0) * w + 2 * outerPad, (y1 - y0) * h + 2 * outerPad);
        ctx.restore();
      }

      if (bubble.state === 'blank' || bubble.state === 'undone') {
        if (bubble.state === 'undone') {
          ctx.save();
          ctx.globalAlpha = 0.7;
          ctx.strokeStyle = '#64748b'; // slate-500 — visually distinct from amber "ambiguous"
          ctx.lineWidth = strokeWidth;
          ctx.setLineDash([2, 3]);
          ctx.strokeRect(x0 * w - pad, y0 * h - pad, (x1 - x0) * w + 2 * pad, (y1 - y0) * h + 2 * pad);
          ctx.restore();
        }
        if (isCorrectOption) {
          ctx.save();
          ctx.strokeStyle = '#ef4444';
          ctx.fillStyle = '#ef4444';
          ctx.lineWidth = strokeWidth;
          drawMissingSymbol(ctx, x1 * w + boxPx * 0.9, stampY, boxPx, strokeWidth);
          ctx.restore();
        }
        continue;
      }

      const marked = bubble.state === 'marked' || bubble.state === 'redone';
      if (marked || !unsure) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = marked ? '#ef4444' : '#f59e0b';
        ctx.lineWidth = strokeWidth;
        ctx.setLineDash(marked ? [] : [6, 4]);
        ctx.strokeRect(x0 * w - pad, y0 * h - pad, (x1 - x0) * w + 2 * pad, (y1 - y0) * h + 2 * pad);
        ctx.restore();
      }

      if (bubble.state === 'redone') {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = strokeWidth;
        ctx.strokeRect((x0 - (x1 - x0) * 0.9) * w, y0 * h, (x1 - x0) * 0.8 * w, (y1 - y0) * h);
        ctx.restore();
      }

      // An unverified ambiguous box whose provisional (closer) reading is "not ticked": keep the
      // orange frame, but score it like a blank box.
      if (bubble.state === 'ambiguous' && bubble.provisional === false) {
        if (isCorrectOption) {
          ctx.save();
          ctx.strokeStyle = '#ef4444';
          ctx.fillStyle = '#ef4444';
          ctx.lineWidth = strokeWidth;
          drawMissingSymbol(ctx, x1 * w + boxPx * 0.9, stampY, boxPx, strokeWidth);
          ctx.restore();
        }
        continue;
      }

      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.fillStyle = '#ef4444';
      if (isCorrectOption) {
        ctx.lineWidth = strokeWidth;
        drawCheckmark(ctx, x1 * w + boxPx * 0.9, stampY, boxPx, strokeWidth);
      } else {
        const textX = x1 * w + boxPx * 0.3;
        const fontSize = Math.max(10, boxPx * 0.7);
        drawScoreText(ctx, textX, stampY, formatSignedScore(-Math.abs(penalty)), fontSize);
      }
      ctx.restore();
    }

    const letter = subExerciseLetters.get(exerciseId);
    if (letter && exercise && bboxMinX !== Infinity) {
      const achieved = scoreInputs[exerciseId] ?? 0;
      const text = `${letter}) ${formatPoints(achieved)}/${formatPoints(exercise.maxPoints)}`;
      const cy = (bboxMinY + bboxMaxY) / 2;
      ctx.save();
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, bboxMinX - 8, cy);
      ctx.restore();
    }
  }
}
