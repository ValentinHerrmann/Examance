import type { VectorStroke } from '#lib/grading/gradingStore';
import { drawCheckmark, drawMissingSymbol } from '#lib/grading/omrOverlay';

const INK = '#ef4444';

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function label(ctx: CanvasRenderingContext2D, font: string, text: string, x: number, y: number) {
  ctx.font = font;
  ctx.fillText(text, x, y);
}

/**
 * Draws the persisted annotation strokes of one page in canvas pixel space. The single renderer
 * for the grading overlay and the graded-PDF export, so both look identical.
 */
export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: VectorStroke[], page: number): void {
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  for (const stroke of strokes) {
    if ((stroke.pageNumber ?? 1) !== page) continue;
    const pts = stroke.points;
    const p = pts[0];
    switch (stroke.tool) {
      case 'pen':
        ctx.beginPath();
        if (p) ctx.moveTo(p.x, p.y);
        for (const q of pts.slice(1)) ctx.lineTo(q.x, q.y);
        ctx.stroke();
        break;
      case 'line':
        if (pts.length >= 2) line(ctx, p.x, p.y, pts[1].x, pts[1].y);
        break;
      case 'check_full':
      case 'check':
        drawCheckmark(ctx, p.x, p.y);
        break;
      case 'check_half':
        drawCheckmark(ctx, p.x, p.y);
        line(ctx, p.x + 1, p.y - 12, p.x + 11, p.y - 2);
        break;
      case 'check_quarter':
        drawCheckmark(ctx, p.x, p.y);
        line(ctx, p.x - 2, p.y - 13, p.x + 8, p.y - 3);
        line(ctx, p.x + 5, p.y - 13, p.x + 15, p.y - 3);
        break;
      case 'minus_full':
        label(ctx, 'bold 26px sans-serif', '-1BE', p.x, p.y);
        break;
      case 'minus_half':
        label(ctx, 'bold 26px sans-serif', '-0,5BE', p.x, p.y);
        break;
      case 'minus_quarter':
        label(ctx, 'bold 26px sans-serif', '-0,25BE', p.x, p.y);
        break;
      case 'wrong':
      case 'cross':
        label(ctx, 'bold italic 30px serif', 'f', p.x, p.y);
        break;
      case 'missing':
        drawMissingSymbol(ctx, p.x, p.y);
        break;
      case 'wf':
        label(ctx, 'bold 24px sans-serif', 'WF', p.x, p.y);
        break;
      case 'ff':
        label(ctx, 'bold 24px sans-serif', 'FF', p.x, p.y);
        break;
    }
  }
}
