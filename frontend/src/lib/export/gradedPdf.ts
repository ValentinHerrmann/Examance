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
import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import { fitText, type PdfLib } from '#lib/pdf/labelKit';
import { formatStudentName } from '#lib/utils/studentQr';
import { makeSafeText } from './summaryPdf';
import { anyReviewPrint, NO_REVIEW_PRINT, drawBottomStrip, drawShortNotes, drawStrip, finishReview, placeReviewItems, printableItems, reviewLabels, stripGeometry, type PlacedItem, type ReviewLabels, type StripGeometry, type ReviewPrint, type ReviewPrintOptions } from './reviewPrint';
import type { GradingReviewItem } from '#lib/db/schema';

/** Same scale as the grading viewer, so stroke coordinates map 1:1. */
const RENDER_SCALE = 2;

export interface GradedPdfOptions {
  /** Legacy-key fallback handed to `openScan`/`openAnnotation` (the session's `fallbackSessionKey`). */
  fallbackKey?: CryptoKey | null;
  /** Printed score-box layout (`loadScoreBoxContext`), loaded once per exam by batch callers; `undefined` loads it here, `null` skips the boxes. */
  scoreBoxes?: ScoreBoxContext | null;
  /** Student's real name, stamped in red at the top of every page (issue #213); empty stamps nothing, never pass a pseudonym or fallback code. */
  studentName?: string | null;
  /** Objections and replies to print (issue #226); no option ticked or no printable item prints nothing. */
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

/** Everything one render shares across its pages. */
interface RenderContext {
  lib: PdfLib;
  out: PDFDocument;
  strokes: VectorStroke[];
  mcState: Record<string, McOverlayState>;
  scoreInputs: Record<string, number | null | undefined>;
  exercises: Awaited<ReturnType<typeof loadExamExercisesEncrypted>>;
  letters: ReturnType<typeof buildSubLabelMap>;
  boxes: ScoreBoxContext | null;
  boxValues: Map<string, string>;
  headerFont: PDFFont | null;
  studentName: string | null | undefined;
  reviewItems: GradingReviewItem[];
  reviewOptions: ReviewPrintOptions;
  labels: ReviewLabels;
}

/** Per-exercise inputs of the overlays: OMR state, scores and part scores. */
function scoreInputsOf(scores: ExerciseScoreRecord[]) {
  const mcState: Record<string, McOverlayState> = {};
  const scoreInputs: Record<string, number | null | undefined> = {};
  const partInputs: Record<string, PartScores | undefined> = {};
  for (const sc of scores) {
    if (sc.omrMeta) mcState[sc.exerciseId] = { omrMeta: sc.omrMeta };
    scoreInputs[sc.exerciseId] = sc.score;
    partInputs[sc.exerciseId] = sc.partScores;
  }
  return { mcState, scoreInputs, partInputs };
}

/** Draws the review of one page: short notes on the scan, then the strip when the page grew one. */
function drawReviewOnPage(c: RenderContext, pdfPage: PDFPage, placed: PlacedItem[], geom: StripGeometry): void {
  if (!c.headerFont || placed.length === 0) return;
  if (c.reviewOptions.short) drawShortNotes(c.lib, pdfPage, c.headerFont, placed, c.labels, { x: geom.imageX, y: geom.imageY });
  if (geom.sideX !== null) drawStrip(c.lib, pdfPage, c.headerFont, placed, c.labels, geom.sideX);
  else if (geom.bottom) drawBottomStrip(c.lib, pdfPage, c.headerFont, placed, c.labels);
}

/** Burns strokes, OMR and score boxes onto a page canvas and appends it; `pointsPerPixel` maps pixels to PDF pt. `alignBoxes` is false for scans that are not the printed booklet page for page. */
async function addPage(c: RenderContext, canvas: HTMLCanvasElement, page: number, pointsPerPixel: number, alignBoxes = false): Promise<void> {
  const ctx = canvas.getContext('2d')!;
  const aligned = alignBoxes ? c.boxes : null;
  // Registered on the bare scan, before anything is drawn onto it.
  const H = aligned && (c.boxValues.size > 0 || c.reviewItems.length > 0) ? registerScorePage(aligned, page, ctx.getImageData(0, 0, canvas.width, canvas.height)) : null;
  drawStrokes(ctx, c.strokes, page);
  drawOmrOverlayForPage(ctx, canvas.width, canvas.height, page, c.mcState, c.exercises, { subExerciseLetters: c.letters, scoreInputs: c.scoreInputs });
  drawScoreBoxesForPage(ctx, canvas.width, canvas.height, c.boxes?.pages[page - 1], H, c.boxValues);
  const png = await c.out.embedPng(await canvasToPng(canvas));
  const w = canvas.width * pointsPerPixel;
  const h = canvas.height * pointsPerPixel;
  const placed = aligned && c.reviewItems.length > 0 ? placeReviewItems(aligned, page, c.reviewItems, H, { w: canvas.width, h: canvas.height }, { w, h }) : [];
  const geom = stripGeometry(c.reviewOptions.strip, placed.length > 0, page, w, h);
  const pdfPage = c.out.addPage([geom.width, geom.height]);
  pdfPage.drawImage(png, { x: geom.imageX, y: geom.imageY, width: w, height: h });
  if (c.headerFont && formatStudentName(c.studentName)) drawStudentHeader(c.lib, pdfPage, c.headerFont, c.studentName);
  drawReviewOnPage(c, pdfPage, placed, geom);
}

/** Renders a PDF scan page by page (one at a time keeps memory bounded). */
async function addPdfScan(c: RenderContext, scanBytes: Uint8Array): Promise<void> {
  const doc = await (await loadPdfjs()).getDocument({ data: scanBytes }).promise;
  const templatePages = c.boxes?.pages.length ?? 0;
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n); // NOSONAR: pages render one at a time to keep memory bounded
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = newCanvas(viewport.width, viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d')!, canvas, viewport }).promise; // NOSONAR
      // The template's pages come first; extra pages after them get no score boxes (issue #220).
      await addPage(c, canvas, n, 1 / RENDER_SCALE, !!c.boxes && doc.numPages >= templatePages && n <= templatePages); // NOSONAR
    }
  } finally {
    await doc.loadingTask.destroy();
  }
}

/** Legacy PNG: crop exactly as the viewer does so strokes line up; 192 dpi source. */
async function addPngScan(c: RenderContext, scanBytes: Uint8Array): Promise<void> {
  const img = await decodePngBytes(scanBytes);
  const crop = legacyScanCrop(img, get(gradingStore).isAutoCropEnabled);
  const canvas = newCanvas(crop.w, crop.h);
  canvas.getContext('2d')!.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  await addPage(c, canvas, 1, 72 / 192);
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

  const { mcState, scoreInputs, partInputs } = scoreInputsOf(scores);
  const exercises = await loadExamExercisesEncrypted(submission.examId, key);
  const letters = buildSubLabelMap(await loadLocalMcGroups(submission.examId).catch(() => []));
  const boxes = options.scoreBoxes === undefined ? await loadScoreBoxContext(submission.examId, key) : options.scoreBoxes;
  const boxValues = boxes ? buildScoreBoxValues({ ...boxes, exercises, scoreInputs, partInputs }) : new Map<string, string>();

  const lib = await import('pdf-lib');
  const out = await lib.PDFDocument.create();
  const reviewOptions = options.review?.options ?? NO_REVIEW_PRINT;
  const reviewItems = anyReviewPrint(reviewOptions) ? printableItems(options.review?.items ?? []) : [];
  const wantsFont = Boolean(formatStudentName(options.studentName)) || reviewItems.length > 0;
  const headerFont = wantsFont ? await out.embedFont(lib.StandardFonts.Helvetica) : null;
  const c: RenderContext = {
    lib, out, strokes, mcState, scoreInputs, exercises, letters, boxes, boxValues, headerFont, reviewItems, reviewOptions,
    studentName: options.studentName,
    labels: reviewLabels(reviewOptions.attach),
  };

  if (isPdfBytes(scanBytes)) await addPdfScan(c, scanBytes);
  else await addPngScan(c, scanBytes);

  if (headerFont && reviewItems.length > 0) await finishReview(lib, out, headerFont, reviewItems, reviewOptions);

  // The original A3 booklet scan attached at ingest travels with every graded copy (issue #220): no scanned page is ever dropped.
  if (isPdfBytes(scanBytes)) await carryAttachments(lib, await lib.PDFDocument.load(scanBytes, { ignoreEncryption: true }), out);
  return out.save();
}
