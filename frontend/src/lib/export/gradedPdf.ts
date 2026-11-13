import { loadExamExercisesEncrypted, loadLocalMcGroups, openAnnotation, openScan } from '#lib/db/dbEncryption';
import { carryAttachments } from '#lib/scan/scanPdf';
import type { ExerciseScoreRecord, SubmissionRecord } from '#lib/db/schema';
import { gradingStore, type VectorStroke } from '#lib/grading/gradingStore';
import { buildSubLabelMap } from '#lib/grading/mcGroupLabels';
import { drawOmrOverlayForPage, type McOverlayState } from '#lib/grading/omrOverlay';
import { drawStrokes } from '#lib/grading/strokeRenderer';
import type { PartScores } from '#lib/grading/partScores';
import {
  buildScoreBoxValues,
  drawScoreBoxesForPage,
  loadScoreBoxContext,
  registerScorePage,
  type ScoreBoxContext,
} from '#lib/grading/scoreBoxes';
import { decodePngBytes, isPdfBytes, legacyScanCrop } from '#lib/components/grading/ScanCanvasViewer';
import { loadPdfjs } from '#lib/pdf/pdfjs';
import { get } from 'svelte/store';
import type { PDFFont, PDFPage } from 'pdf-lib';
import { fitText, type PdfLib } from '#lib/pdf/labelKit';
import { formatStudentName } from '#lib/utils/studentQr';
import { makeSafeText } from './summaryPdf';
import { drawShortNotes, drawStrip, finishReview, placeReviewItems, printableItems, reviewLabels, STRIP_WIDTH_PT, type ReviewPrint } from './reviewPrint';

/** Same scale as the grading viewer, so stroke coordinates map 1:1. */
const RENDER_SCALE = 2;

export interface GradedPdfOptions {
  /** Legacy-key fallback handed to `openScan`/`openAnnotation` (the session's `fallbackSessionKey`). */
  fallbackKey?: CryptoKey | null;
  /** Printed score-box layout (`loadScoreBoxContext`), loaded once per exam by batch callers; `undefined` loads it here, `null` skips the boxes. */
  scoreBoxes?: ScoreBoxContext | null;
  /** Student's real name, stamped in red at the top of every page (issue #213); empty stamps nothing, never pass a pseudonym or fallback code. */
  studentName?: string | null;
  /** Objections and replies to print (issue #226); `none` or no printable item prints nothing. */
  review?: ReviewPrint;
}

const HEADER = { size: 12, top: 30, margin: 30, color: [1, 0.5, 0.5] as const };

/** Draws "Schüler/-in: name" centred at the top of *page*, as DiRueLei does; German on purpose, PDF output is not translated. */
export function drawStudentHeader(lib: PdfLib, page: PDFPage, font: PDFFont, name: string | null | undefined): void {
  const clean = formatStudentName(name);
  if (!clean) return;
  const { width, height } = page.getSize();
  const text = fitText(font, makeSafeText(font)(`Schüler/-in: ${clean}`), HEADER.size, Math.max(width - 2 * HEADER.margin, 1));
  const x = Math.max((width - font.widthOfTextAtSize(text, HEADER.size)) / 2, 0);
  page.drawText(text, { x, y: height - HEADER.top, size: HEADER.size, font, color: lib.rgb(...HEADER.color) });
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

/** Returns the scan with strokes and OMR detections burned in. Pure bytes: no download, no UI; throws on any failure. */
export async function renderGradedPdf(
  submission: SubmissionRecord,
  scores: ExerciseScoreRecord[],
  key: CryptoKey,
  options: GradedPdfOptions = {}
): Promise<Uint8Array> {
  const { fallbackKey = null } = options;
  if (!submission.scanCt || !submission.scanIv) throw new Error('Scan data not found');

  const scanBytes = await openScan(submission.id, submission.scanCt, submission.scanIv, key, fallbackKey);
  let strokes: VectorStroke[] = [];
  if (submission.annotationCt && submission.annotationIv) {
    const annBytes = await openAnnotation(submission.id, submission.annotationCt, submission.annotationIv, key, fallbackKey);
    strokes = JSON.parse(new TextDecoder().decode(annBytes));
  }

  const mcState: Record<string, McOverlayState> = {};
  const scoreInputs: Record<string, number | null | undefined> = {};
  const partInputs: Record<string, PartScores | undefined> = {};
  for (const sc of scores) {
    if (sc.omrMeta) mcState[sc.exerciseId] = { omrMeta: sc.omrMeta };
    scoreInputs[sc.exerciseId] = sc.score;
    partInputs[sc.exerciseId] = sc.partScores;
  }
  const exercises = await loadExamExercisesEncrypted(submission.examId, key);
  const letters = buildSubLabelMap(await loadLocalMcGroups(submission.examId).catch(() => []));
  const boxes = options.scoreBoxes === undefined ? await loadScoreBoxContext(submission.examId, key) : options.scoreBoxes;
  const boxValues = boxes ? buildScoreBoxValues({ ...boxes, exercises, scoreInputs, partInputs }) : new Map<string, string>();

  const lib = await import('pdf-lib');
  const out = await lib.PDFDocument.create();
  const reviewMode = options.review?.mode ?? 'none';
  const reviewItems = reviewMode === 'none' ? [] : printableItems(options.review?.items ?? []);
  const headerFont = formatStudentName(options.studentName) || reviewItems.length > 0 ? await out.embedFont(lib.StandardFonts.Helvetica) : null;
  const labels = reviewLabels();

  // Burns strokes, OMR and score boxes onto a page canvas and appends it; `pointsPerPixel` maps pixels to PDF pt. `alignBoxes` is false for scans that are not the printed booklet page for page.
  const addPage = async (canvas: HTMLCanvasElement, page: number, pointsPerPixel: number, alignBoxes = false) => {
    const ctx = canvas.getContext('2d')!;
    // Registered on the bare scan, before anything is drawn onto it.
    const H = alignBoxes && boxes && (boxValues.size > 0 || reviewItems.length > 0)
      ? registerScorePage(boxes, page, ctx.getImageData(0, 0, canvas.width, canvas.height))
      : null;
    drawStrokes(ctx, strokes, page);
    drawOmrOverlayForPage(ctx, canvas.width, canvas.height, page, mcState, exercises, { subExerciseLetters: letters, scoreInputs });
    drawScoreBoxesForPage(ctx, canvas.width, canvas.height, boxes?.pages[page - 1], H, boxValues);
    const png = await out.embedPng(await canvasToPng(canvas));
    const w = canvas.width * pointsPerPixel;
    const h = canvas.height * pointsPerPixel;
    const placed = alignBoxes && boxes && reviewItems.length > 0 ? placeReviewItems(boxes, page, reviewItems, H, { w: canvas.width, h: canvas.height }, { w, h }) : [];
    // The strip sits on the outer side: right on odd pages, left on even ones; the scan itself is never moved or scaled.
    const strip = reviewMode === 'strip' && placed.length > 0 ? (page % 2 === 1 ? 'right' : 'left') : null;
    const imageX = strip === 'left' ? STRIP_WIDTH_PT : 0;
    const pdfPage = out.addPage([w + (strip ? STRIP_WIDTH_PT : 0), h]);
    pdfPage.drawImage(png, { x: imageX, y: 0, width: w, height: h });
    if (headerFont && formatStudentName(options.studentName)) drawStudentHeader(lib, pdfPage, headerFont, options.studentName);
    if (headerFont && placed.length > 0) {
      if (reviewMode === 'short') drawShortNotes(lib, pdfPage, headerFont, placed, labels);
      else if (strip) drawStrip(lib, pdfPage, headerFont, placed, labels, strip === 'right' ? w : 0);
    }
  };

  if (isPdfBytes(scanBytes)) {
    const doc = await (await loadPdfjs()).getDocument({ data: scanBytes }).promise;
    try {
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n); // NOSONAR: pages render one at a time to keep memory bounded
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = newCanvas(viewport.width, viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d')!, canvas, viewport }).promise; // NOSONAR
        // The template's pages come first; extra pages after them get no score boxes (issue #220).
        await addPage(canvas, n, 1 / RENDER_SCALE, !!boxes && doc.numPages >= boxes.pages.length && n <= boxes.pages.length); // NOSONAR
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

  if (headerFont && reviewItems.length > 0) await finishReview(lib, out, headerFont, reviewItems, reviewMode);

  // The original A3 booklet scan attached at ingest travels with every graded copy (issue #220): no scanned page is ever dropped.
  if (isPdfBytes(scanBytes)) await carryAttachments(lib, await lib.PDFDocument.load(scanBytes, { ignoreEncryption: true }), out);
  return out.save();
}
