import { loadPdfjs } from '#lib/pdf/pdfjs';
import { drawOmrOverlayForPage } from '#lib/grading/omrOverlay';
import type { ExerciseRecord, OmrScoreMeta } from '#lib/db/schema';

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
  paddingTop?: number;
  paddingBottom?: number;
  neighbourRects?: Array<[number, number, number, number]>;
    /** Draws the grading-canvas bubble-box overlay (`omrOverlay.ts`) before cropping so the crop matches the grader's view. */
  overlay?: {
    exercise: ExerciseRecord;
    omrMeta: OmrScoreMeta;
  };
}

export interface McCropLayers {
  /** The scan crop without any markings. */
  plain: string;
  /** The same crop with the OMR overlay; equals `plain` when no overlay was requested. */
  marked: string;
}

/** Renders one page of a decrypted scan PDF onto a fresh canvas at `scale`, then frees pdf.js' document copy. Shared by the verification and training-sample crops. */
export async function renderScanPage(
  pdfBytes: Uint8Array,
  pageIndex: number,
  scale: number
): Promise<HTMLCanvasElement> {
  const pdfjsLib = await loadPdfjs();
    // pdf.js transfers the ArrayBuffer to its worker (detaching it); callers reuse `pdfBytes`,
    // so pass a copy or the second call throws "ArrayBuffer is detached".
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
  const pdfDoc = await loadingTask.promise;
  try {
    const targetPageIndex = Math.max(0, Math.min(pdfDoc.numPages - 1, pageIndex));
    const pdfPage = await pdfDoc.getPage(targetPageIndex + 1);
    const viewport = pdfPage.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2d context for PDF rendering');
    await pdfPage.render({ canvasContext: ctx, viewport } as any).promise;
    return canvas;
  } finally {
    await loadingTask.destroy();
  }
}

/**
 * Renders a cropped high-DPI image of an MC bubble region, with and without the overlay (same
 * page render), so a viewer can toggle markings. Returns PNG data URLs.
 */
export async function renderMcCrop(options: McCropOptions): Promise<McCropLayers> {
  const {
    pdfBytes,
    pageIndex,
    bubbles,
    scale = 3.0,
    paddingX = 0.15,
    paddingY,
    paddingTop = paddingY ?? 0.035,
    paddingBottom = paddingY ?? 0.015,
    neighbourRects,
    overlay,
  } = options;

  const canvas = await renderScanPage(pdfBytes, pageIndex, scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context for PDF rendering');

  // Plain page, before the overlay is drawn onto the same canvas.
  const plainPage = document.createElement('canvas');
  plainPage.width = canvas.width;
  plainPage.height = canvas.height;
  plainPage.getContext('2d')?.drawImage(canvas, 0, 0);

  if (overlay) {
    drawOmrOverlayForPage(
      ctx,
      canvas.width,
      canvas.height,
      pageIndex + 1,
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
  let cropMinY = Math.max(0, minY - paddingTop);
  let cropMaxY = Math.min(1, maxY + paddingBottom);

  if (neighbourRects && neighbourRects.length > 0) {
    let maxNeighbourY1 = -Infinity;
    let minNeighbourY0 = Infinity;

    for (const r of neighbourRects) {
      if (!r || r.length < 4) continue;
      const [, y0, , y1] = r;
      if (y1 <= minY && y1 > maxNeighbourY1) {
        maxNeighbourY1 = y1;
      }
      if (y0 >= maxY && y0 < minNeighbourY0) {
        minNeighbourY0 = y0;
      }
    }

    if (maxNeighbourY1 !== -Infinity) {
      cropMinY = Math.max(cropMinY, maxNeighbourY1 + 0.005);
    }
    if (minNeighbourY0 !== Infinity) {
      cropMaxY = Math.min(cropMaxY, minNeighbourY0 - 0.005);
    }
  }

  if (cropMinY > cropMaxY) {
    cropMinY = Math.max(0, minY - paddingTop);
    cropMaxY = Math.min(1, maxY + paddingBottom);
  }

  const pxMinX = Math.floor(cropMinX * canvas.width);
  const pxMinY = Math.floor(cropMinY * canvas.height);
  const pxMaxX = Math.ceil(cropMaxX * canvas.width);
  const pxMaxY = Math.ceil(cropMaxY * canvas.height);

  const cropWidth = Math.max(1, pxMaxX - pxMinX);
  const cropHeight = Math.max(1, pxMaxY - pxMinY);

  const ownBandTop = minY - 0.03;
  const ownBandBottom = maxY + 0.01;

  const cropToDataUrl = (source: HTMLCanvasElement): string => {
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropWidth;
    cropCanvas.height = cropHeight;
    const cropCtx = cropCanvas.getContext('2d');
    if (!cropCtx) throw new Error('Failed to get crop canvas context');

    cropCtx.drawImage(source, pxMinX, pxMinY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    // Dim what lies outside the exercise's own band, so leftover neighbour content
    // reads as "not this one".
    cropCtx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    const pxBandTop = Math.round(ownBandTop * canvas.height);
    const topOverlayHeight = Math.max(0, Math.min(cropHeight, pxBandTop - pxMinY));
    if (topOverlayHeight > 0) {
      cropCtx.fillRect(0, 0, cropWidth, topOverlayHeight);
    }
    const pxBandBottom = Math.round(ownBandBottom * canvas.height);
    const bottomOverlayY = Math.max(0, pxBandBottom - pxMinY);
    if (bottomOverlayY < cropHeight) {
      cropCtx.fillRect(0, bottomOverlayY, cropWidth, cropHeight - bottomOverlayY);
    }

    return cropCanvas.toDataURL('image/png');
  };

  const plain = cropToDataUrl(plainPage);
  return { plain, marked: overlay ? cropToDataUrl(canvas) : plain };
}
