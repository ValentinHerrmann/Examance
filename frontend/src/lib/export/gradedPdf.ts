import { decrypt } from '#lib/crypto/aesGcm';
import { loadExamExercisesEncrypted, loadLocalMcGroups } from '#lib/db/dbEncryption';
import type { ExerciseScoreRecord, SubmissionRecord } from '#lib/db/schema';
import { gradingStore, type VectorStroke } from '#lib/grading/gradingStore';
import { buildSubLabelMap } from '#lib/grading/mcGroupLabels';
import { drawOmrOverlayForPage, type McOverlayState } from '#lib/grading/omrOverlay';
import { drawStrokes } from '#lib/grading/strokeRenderer';
import { decodePngBytes, isPdfBytes, legacyScanCrop } from '#lib/components/grading/ScanCanvasViewer';
import { loadPdfjs } from '#lib/pdf/pdfjs';
import { get } from 'svelte/store';

/** Same scale as the grading viewer, so stroke coordinates map 1:1. */
const RENDER_SCALE = 2;

export interface GradedPdfOptions {
  /** Legacy-key fallback handed to `decrypt` (the session's `fallbackSessionKey`). */
  fallbackKey?: CryptoKey | null;
}

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('Canvas export failed'));
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
    }, 'image/png');
  });
}

/**
 * Returns the scan with strokes and OMR detections burned in. Pure bytes: no download, no UI;
 * throws on any failure.
 */
export async function renderGradedPdf(
  submission: SubmissionRecord,
  scores: ExerciseScoreRecord[],
  key: CryptoKey,
  options: GradedPdfOptions = {}
): Promise<Uint8Array> {
  const { fallbackKey = null } = options;
  if (!submission.scanCt || !submission.scanIv) throw new Error('Scan data not found');

  const scanBytes = await decrypt(key, submission.scanCt, submission.scanIv, fallbackKey);
  let strokes: VectorStroke[] = [];
  if (submission.annotationCt && submission.annotationIv) {
    const annBytes = await decrypt(key, submission.annotationCt, submission.annotationIv, fallbackKey);
    strokes = JSON.parse(new TextDecoder().decode(annBytes));
  }

  const mcState: Record<string, McOverlayState> = {};
  const scoreInputs: Record<string, number | null | undefined> = {};
  for (const sc of scores) {
    if (sc.omrMeta) mcState[sc.exerciseId] = { omrMeta: sc.omrMeta };
    scoreInputs[sc.exerciseId] = sc.score;
  }
  const exercises = await loadExamExercisesEncrypted(submission.examId, key);
  const letters = buildSubLabelMap(await loadLocalMcGroups(submission.examId).catch(() => []));

  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();

  // Burns strokes + OMR onto a page canvas and appends it; `pointsPerPixel` maps pixels to PDF pt.
  const addPage = async (canvas: HTMLCanvasElement, page: number, pointsPerPixel: number) => {
    const ctx = canvas.getContext('2d')!;
    drawStrokes(ctx, strokes, page);
    drawOmrOverlayForPage(ctx, canvas.width, canvas.height, page, mcState, exercises, letters, scoreInputs);
    const png = await out.embedPng(await canvasToPng(canvas));
    const w = canvas.width * pointsPerPixel;
    const h = canvas.height * pointsPerPixel;
    out.addPage([w, h]).drawImage(png, { x: 0, y: 0, width: w, height: h });
  };

  if (isPdfBytes(scanBytes)) {
    const doc = await (await loadPdfjs()).getDocument({ data: scanBytes }).promise;
    try {
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = newCanvas(viewport.width, viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d')!, canvas, viewport }).promise;
        await addPage(canvas, n, 1 / RENDER_SCALE);
      }
    } finally {
      await doc.loadingTask.destroy();
    }
  } else {
    // Legacy PNG: crop exactly as the viewer does so strokes line up; 192 dpi source.
    const img = await decodePngBytes(scanBytes);
    const crop = legacyScanCrop(img, get(gradingStore).isAutoCropEnabled);
    const canvas = newCanvas(crop.w, crop.h);
    canvas.getContext('2d')!.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
    await addPage(canvas, 1, 72 / 192);
  }

  return out.save();
}
