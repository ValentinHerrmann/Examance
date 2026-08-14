import { loadPdfjs } from '$lib/pdf/pdfjs';
import { drawOmrOverlayForPage } from '$lib/grading/omrOverlay';
import type { ExerciseRecord, OmrScoreMeta } from '$lib/db/schema';

export interface McCropOptions {
  pdfBytes: Uint8Array;
  pageIndex: number;
  bubbles: Array<{
    optionIndex: number;
    state?: string;
    rect: [number, number, number, number]; // normalized [x0, y0, x1, y1] in [0, 1]
  }>;
  scale?: number;
  paddingX?: number;
  paddingY?: number;
  /**
   * Draws the same red/amber bubble-box + checkmark/missing-symbol overlay used on the
   * grading canvas (`omrOverlay.ts`) onto the page before cropping, so what the crop shows
   * matches what a grader sees in the canvas workspace exactly.
   */
  overlay?: {
    exercise: ExerciseRecord;
    omrMeta: OmrScoreMeta;
  };
}

/**
 * Renders a cropped high-DPI image of an MC exercise bubble region from a submission scan PDF.
 * Returns a PNG data URL of the cropped region.
 */
export async function renderMcCrop(options: McCropOptions): Promise<string> {
  const {
    pdfBytes,
    pageIndex,
    bubbles,
    scale = 3.0,
    paddingX = 0.15,
    paddingY = 0.08,
    overlay,
  } = options;

  const pdfjsLib = await loadPdfjs();
  // pdf.js transfers the underlying ArrayBuffer to its worker via postMessage,
  // detaching it on the caller's side. `pdfBytes` here is shared with (and
  // reused by) the parent component across re-renders, so we hand pdf.js a
  // throwaway copy instead of the original — otherwise the second call ever
  // made with the same buffer throws "ArrayBuffer is detached" (DataCloneError).
  const pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
  const targetPageIndex = Math.max(0, Math.min(pdfDoc.numPages - 1, pageIndex));
  const pdfPage = await pdfDoc.getPage(targetPageIndex + 1);

  const viewport = pdfPage.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context for PDF rendering');

  await pdfPage.render({ canvasContext: ctx, viewport } as any).promise;

  if (overlay) {
    drawOmrOverlayForPage(
      ctx,
      canvas.width,
      canvas.height,
      targetPageIndex + 1,
      { [overlay.exercise.id]: { omrMeta: overlay.omrMeta } },
      [overlay.exercise],
      new Map(), // no sub-exercise letter/running-total stamp in the single-item crop view
      {}
    );
  }

  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;

  if (bubbles && bubbles.length > 0) {
    for (const b of bubbles) {
      if (!b.rect || b.rect.length < 4) continue;
      const [x0, y0, x1, y1] = b.rect;
      minX = Math.min(minX, x0);
      minY = Math.min(minY, y0);
      maxX = Math.max(maxX, x1);
      maxY = Math.max(maxY, y1);
    }
  }

  if (minX >= maxX || minY >= maxY) {
    minX = 0.1;
    maxX = 0.9;
    minY = 0.1;
    maxY = 0.5;
  }

  const cropMinX = Math.max(0, minX - paddingX);
  const cropMaxX = Math.min(1, maxX + paddingX);
  const cropMinY = Math.max(0, minY - paddingY);
  const cropMaxY = Math.min(1, maxY + paddingY);

  const pxMinX = Math.floor(cropMinX * viewport.width);
  const pxMinY = Math.floor(cropMinY * viewport.height);
  const pxMaxX = Math.ceil(cropMaxX * viewport.width);
  const pxMaxY = Math.ceil(cropMaxY * viewport.height);

  const cropWidth = Math.max(1, pxMaxX - pxMinX);
  const cropHeight = Math.max(1, pxMaxY - pxMinY);

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropWidth;
  cropCanvas.height = cropHeight;
  const cropCtx = cropCanvas.getContext('2d');
  if (!cropCtx) throw new Error('Failed to get crop canvas context');

  cropCtx.drawImage(
    canvas,
    pxMinX,
    pxMinY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  );

  return cropCanvas.toDataURL('image/png');
}
