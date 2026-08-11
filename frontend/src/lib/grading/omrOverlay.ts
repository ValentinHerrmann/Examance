/**
 * OMR auto-grading overlay drawing — shared by the live grading canvas
 * (ScanCanvasViewer.svelte) and the graded-PDF export (routes/exam/[id]/scan/+page.svelte)
 * so both render the exact same annotations from the same data.
 */

import type { ExerciseRecord, OmrScoreMeta } from '$lib/db/schema';

export interface McOverlayState {
  omrMeta?: OmrScoreMeta;
}

/** Shared by the manual `check_full`/`check` stroke tool and the OMR pass below. */
export function drawCheckmark(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath();
  ctx.moveTo(x - 14, y - 2);
  ctx.lineTo(x - 4, y + 10);
  ctx.lineTo(x + 16, y - 18);
  ctx.stroke();
}

/** Shared by the manual `missing` stroke tool and the OMR pass below. */
export function drawMissingSymbol(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath();
  ctx.moveTo(x - 12, y - 18);
  ctx.lineTo(x, y + 4);
  ctx.lineTo(x + 12, y - 18);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 15, y - 8);
  ctx.lineTo(x + 15, y - 8);
  ctx.stroke();
}

export function drawScoreText(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  ctx.font = 'bold 26px sans-serif';
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
 * Draws OMR-derived annotations over every MC/SC/TF exercise on one page — a separate,
 * non-persisted overlay pass, not part of the manual annotation strokes. Rects are
 * normalized [minX,minY,maxX,maxY] in [0,1] of the scan page (set by omrWorker.ts), so
 * `w`/`h` should be the raster's pixel dimensions.
 *
 * For marked/ambiguous bubbles: colored box (red solid = confidently marked, amber dashed =
 * ambiguous) plus a score stamp (+1 for a correct tick, -penalty for a wrong one). For
 * blank bubbles whose option is in `correctAnswers` (a correct option the student didn't
 * mark): the `missing` stamp symbol. For exercises that are part of an MC group: a
 * per-sub-exercise running total ("a) 1/2") above its bubble cluster.
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
    const penalty = exercise?.penalty ?? 0;

    let bboxMinX = Infinity;
    let bboxMinY = Infinity;
    let bboxMaxY = -Infinity;

    for (const bubble of detections.bubbles) {
      const [x0, y0, x1, y1] = bubble.rect;
      const cx = ((x0 + x1) / 2) * w;
      const cy = ((y0 + y1) / 2) * h;
      const isCorrectOption = correctAnswers.has(bubble.optionIndex);

      bboxMinX = Math.min(bboxMinX, x0 * w);
      bboxMinY = Math.min(bboxMinY, y0 * h);
      bboxMaxY = Math.max(bboxMaxY, y1 * h);

      if (bubble.state === 'blank') {
        if (isCorrectOption) {
          ctx.save();
          ctx.strokeStyle = '#ef4444';
          ctx.fillStyle = '#ef4444';
          ctx.lineWidth = 3;
          drawMissingSymbol(ctx, cx, cy);
          ctx.restore();
        }
        continue;
      }

      const marked = bubble.state === 'marked';
      ctx.save();
      ctx.strokeStyle = marked ? '#ef4444' : '#f59e0b';
      ctx.lineWidth = 3;
      ctx.setLineDash(marked ? [] : [6, 4]);
      ctx.strokeRect(x0 * w, y0 * h, (x1 - x0) * w, (y1 - y0) * h);
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.fillStyle = '#ef4444';
      if (isCorrectOption) {
        ctx.lineWidth = 3;
        drawCheckmark(ctx, x1 * w + 16, y0 * h - 8);
      } else {
        drawScoreText(ctx, x1 * w + 4, y0 * h, formatSignedScore(-Math.abs(penalty)));
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
