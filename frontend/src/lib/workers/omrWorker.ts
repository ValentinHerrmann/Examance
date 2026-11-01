/** Web Worker for OMR and fiducial alignment: binarize (Otsu), locate the 4 corner fiducials (largest dark blob per quadrant), homography (4-point DLT, 3-point affine fallback), sample each bubble's fill ratio, score via mcScore.ts. No OpenCV.js: bubble positions come from the PDF's `omr://` link annotations ("Prepare OMR"); only fiducials are detected. */

import type { OmrPageTemplate } from '#lib/db/schema';
import { buildAffine3, bubbleBBoxInImage, registerPage, transformPoint, type Homography } from '#lib/grading/omrRegistration';
import { computeMcScore, type McQuestionType } from '#lib/grading/mcScore';
import {
  normalizeOmrParams,
  type OmrDetectionParams,
  type OmrPageStats,
} from '#lib/grading/omrSettings';
import {
  blackReference,
  cellFills,
  classifyV2,
  classifyV4,
  effectiveRedoRect,
  inkContrast,
  measureBox,
  median,
  ringFill,
  sampleFillRatio,
  type OmrBubbleClassification,
  type OmrBubbleState,
  type OmrShapeFeatures,
  type OmrShapeReason,
} from '#lib/grading/omrShape';

export interface OmrExerciseAnswerKey {
  exerciseId: string;
  questionType: McQuestionType;
  correctAnswers: number[];
  penalty: number;
  maxPoints: number;
}

export interface OmrWorkerRequest {
  type: 'OMR_PROCESS';
  imageData: ImageData;
  pageTemplate: OmrPageTemplate;
  /** Scale factor the scan was rasterized at (e.g. 2.0), matching pdfjs viewport scale semantics. */
  scanScale: number;
  answerKeys: OmrExerciseAnswerKey[];
  /** Detection thresholds for this run (`omrSettings.ts`). Absent → built-in defaults. The caller snapshots these once per run and stamps the same object into `omrMeta.run`. */
  params?: OmrDetectionParams;
}

export interface OmrBubbleReading {
  optionIndex: number;
  fillRatio: number;
  state: OmrBubbleState;
  /** Redo-zone fill ratio, measured whenever the bubble's template has a redoRect. */
  redoRatio?: number;
  /** v4 measurements (`measureBox`), always computed — also when v2 decides. */
  shape?: OmrShapeFeatures;
  /** Why the shape analysis changed or flagged this reading; non-empty → flagged for review. */
  reasons?: OmrShapeReason[];
  /** For `ambiguous` boxes: the closer outcome (true = ticked), counted until verified. */
  provisional?: boolean;
  /** Verdict of the algorithm that did *not* decide (shadow run), for comparison on verified data. */
  alt?: { algorithm: number; state: OmrBubbleState; reasons?: OmrShapeReason[]; provisional?: boolean };
    /** Bubble bbox normalized to [0,1] of (width, height) as [minX,minY,maxX,maxY], so the grading viewer can draw it at its own scale. [0,0,0,0] when alignment failed (state is 'blank', nothing drawn). */
  rect: [number, number, number, number];
}

export interface OmrExerciseResult {
  exerciseId: string;
  /** 0-based, matches OmrPageTemplate.pageIndex — lets the grading viewer show detection boxes only for the page currently on screen. */
  pageIndex: number;
  selectedOptions: number[];
  score: number;
  confidence: 'high' | 'ambiguous' | 'failed';
  flaggedOptions: number[];
  bubbles: OmrBubbleReading[];
  alignmentUncertain?: boolean;
}

export type OmrWorkerResponse =
  | {
      type: 'OMR_RESULT';
      results: OmrExerciseResult[];
      alignmentFailed: boolean;
      alignmentUncertain: boolean;
      fiducialsFound: number;
      /** Corner indices (0=BL,1=BR,2=TR,3=TL) actually detected this pass — lets a caller report exactly which corner is missing instead of just a count. */
      fiducialCorners: number[];
      /** Registration diagnostics for this page — persisted with each score for future calibration. */
      pageStats: OmrPageStats;
    }
  | { type: 'ERROR'; message: string };

/** Alignment only, for the score boxes of the grading viewer (issue #187): keeps that work off the main thread. */
export interface OmrRegisterRequest {
  type: 'REGISTER_PAGE';
  id: number;
  imageData: ImageData;
  pageTemplate: OmrPageTemplate;
  scanScale: number;
  params: OmrDetectionParams;
}

export interface OmrRegisterResponse {
  type: 'REGISTER_RESULT';
  id: number;
  /** Null when fewer than 3 fiducials were found or the worker failed. */
  homography: Homography | null;
}

function handleRegister(req: OmrRegisterRequest) {
  let homography: Homography | null = null;
  try {
    homography = registerPage(req.imageData, req.pageTemplate, req.scanScale, normalizeOmrParams(req.params)).H;
  } catch (err) {
    console.warn('[omrWorker] registration failed:', err);
  }
  self.postMessage({ type: 'REGISTER_RESULT', id: req.id, homography } satisfies OmrRegisterResponse);
}

// Every threshold below comes from `OmrDetectionParams` (lib/grading/omrSettings.ts), whose defaults are the constants this file used to hardcode.

/** The binarized scan of one page and its mapping to the template. */
interface PageScan {
  gray: Uint8ClampedArray;
  dark: Uint8Array;
  width: number;
  height: number;
  threshold: number;
  blackRef: number;
  H: Homography;
  scanScale: number;
  pageHeightPt: number;
  params: OmrDetectionParams;
}

interface AlignmentQuality {
  uncertain: boolean;
  residualFraction?: number;
  ratioDiff?: number;
  angleDeg?: number;
}

/** With 4 fiducials: how far the 4th lands from where the affine fit of the other 3 puts it. */
function affineResidual(srcPts: [number, number][], dstPts: [number, number][], width: number, params: OmrDetectionParams): AlignmentQuality {
  const affine = buildAffine3(srcPts.slice(0, 3), dstPts.slice(0, 3));
  if (!affine) return { uncertain: true };
  const [mX, mY] = transformPoint(affine, srcPts[3][0], srcPts[3][1]);
  const residual = Math.hypot(mX - dstPts[3][0], mY - dstPts[3][1]);
  return {
    uncertain: residual > params.alignResidualFraction * width,
    residualFraction: width > 0 ? residual / width : undefined,
  };
}

/** Maps the template page's corners through H: a correct registration keeps the page's aspect ratio and right angles. */
function pageShape(H: Homography, pageTemplate: OmrPageTemplate, scanScale: number, width: number, height: number, params: OmrDetectionParams): AlignmentQuality {
  const expW = pageTemplate.pageWidthPt * scanScale;
  const expH = pageTemplate.pageHeightPt * scanScale;
  const cTL = transformPoint(H, 0, 0);
  const cTR = transformPoint(H, expW, 0);
  const cBR = transformPoint(H, expW, expH);
  const cBL = transformPoint(H, 0, expH);

  const vTop: [number, number] = [cTR[0] - cTL[0], cTR[1] - cTL[1]];
  const vBottom: [number, number] = [cBR[0] - cBL[0], cBR[1] - cBL[1]];
  const vLeft: [number, number] = [cBL[0] - cTL[0], cBL[1] - cTL[1]];
  const vRight: [number, number] = [cBR[0] - cTR[0], cBR[1] - cTR[1]];

  const topLen = Math.hypot(vTop[0], vTop[1]);
  const leftLen = Math.hypot(vLeft[0], vLeft[1]);
  const mappedW = (topLen + Math.hypot(vBottom[0], vBottom[1])) / 2;
  const mappedH = (leftLen + Math.hypot(vRight[0], vRight[1])) / 2;
  if (mappedW <= 0 || mappedH <= 0 || width <= 0 || height <= 0) return { uncertain: true };

  // Compare against the page itself, not the scan image — a scanner bed larger than the sheet changes the image's ratio, not the page's.
  const pageRatio = expW / expH;
  const ratioDiff = Math.abs(mappedW / mappedH - pageRatio) / pageRatio;
  if (topLen <= 0 || leftLen <= 0) return { uncertain: true, ratioDiff };
  const dot = vTop[0] * vLeft[0] + vTop[1] * vLeft[1];
  const cosAngle = Math.max(-1, Math.min(1, dot / (topLen * leftLen)));
  const angleDeg = (Math.acos(cosAngle) * 180) / Math.PI;
  return {
    uncertain: ratioDiff > params.alignRatioTolerance || Math.abs(angleDeg - 90) > params.alignAngleToleranceDeg,
    ratioDiff,
    angleDeg,
  };
}

/** Registration diagnostics: 3 fiducials (affine fallback) are always uncertain; with 4, the residual and the mapped page shape decide. */
function alignmentQuality(
  reg: { H: Homography | null; fiducialsFound: number; srcPts: [number, number][]; dstPts: [number, number][] },
  pageTemplate: OmrPageTemplate,
  scanScale: number,
  width: number,
  height: number,
  params: OmrDetectionParams
): AlignmentQuality {
  if (!reg.H) return { uncertain: false };
  if (reg.fiducialsFound === 3) return { uncertain: true };
  if (reg.fiducialsFound < 4) return { uncertain: false };
  const residual = affineResidual(reg.srcPts, reg.dstPts, width, params);
  const shape = pageShape(reg.H, pageTemplate, scanScale, width, height, params);
  return { ...residual, ...shape, uncertain: residual.uncertain || shape.uncertain };
}

/** Pass 1: measure every box both ways — v4 (local threshold, border snapping, strokes) and v2 (global Otsu, template rect). Spill needs every sibling's ring before classifying. */
function measureBubbles(scan: PageScan, bubbleRects: OmrPageTemplate['bubbles']) {
  const { gray, dark, width, height, threshold, blackRef, H, scanScale, pageHeightPt, params } = scan;
  return bubbleRects.map((b) => {
    const bbox = bubbleBBoxInImage(H, b.rect, scanScale, pageHeightPt);
    const redoBbox = b.redoRect
      ? bubbleBBoxInImage(H, effectiveRedoRect(b.rect, b.redoRect), scanScale, pageHeightPt)
      : undefined;
    const cells = cellFills(dark, width, height, bbox, params.sampleInsetFraction);
    const maxCell = Math.max(...cells);
    return {
      b,
      bbox,
      m: measureBox(gray, width, height, bbox, redoBbox, blackRef, params),
      v2: {
        fill: sampleFillRatio(dark, width, height, bbox, params.sampleInsetFraction),
        redoRatio: redoBbox ? sampleFillRatio(dark, width, height, redoBbox, params.sampleInsetFraction) : undefined,
        minCellFill: Math.min(...cells),
        cellEvenness: maxCell > 0 ? Math.min(...cells) / maxCell : 0,
        ringFill: ringFill(dark, width, height, bbox, params.ringFraction, redoBbox),
        inkContrast: inkContrast(gray, dark, width, height, bbox, params.sampleInsetFraction, threshold, blackRef),
      },
    };
  });
}

type MeasuredBubble = ReturnType<typeof measureBubbles>[number];

const spill = (own: number, rings: number[]) => (rings.length > 0 ? { spillExcess: own - median(rings) } : {});
const classifiedExtras = (c: OmrBubbleClassification) => ({
  ...(c.reasons.length > 0 ? { reasons: c.reasons } : {}),
  ...(c.provisional !== undefined ? { provisional: c.provisional } : {}),
});

/** Pass 2: classify one box with both algorithms (against its siblings' rings) and report it where its printed border really is. */
function classifyBubble(measured: MeasuredBubble[], i: number, scan: PageScan): OmrBubbleReading {
  const { b, bbox: rawBbox, m, v2 } = measured[i];
  const { width, height, params } = scan;
  const others = measured.filter((_, j) => j !== i);
  const shape: OmrShapeFeatures = {
    ...m.features,
    ...spill(m.features.ringFill, others.map((o) => o.m.features.ringFill)),
  };
  const dec4 = classifyV4({ fill: m.fill, redoRatio: m.redoRatio, features: shape }, params);
  const dec2 = classifyV2(
    {
      fill: v2.fill,
      redoRatio: v2.redoRatio,
      features: {
        minCellFill: v2.minCellFill,
        cellEvenness: v2.cellEvenness,
        ringFill: v2.ringFill,
        ...spill(v2.ringFill, others.map((o) => o.v2.ringFill)),
        inkContrast: v2.inkContrast,
      },
    },
    params
  );
  const [chosen, other, otherAlgorithm]: [OmrBubbleClassification, OmrBubbleClassification, number] =
    params.algorithm === 4 ? [dec4, dec2, 2] : [dec2, dec4, 4];

  // The snapped box, not the raw template position — the viewer's overlay and any crop then sit on the real box.
  const w = rawBbox.maxX - rawBbox.minX;
  const h = rawBbox.maxY - rawBbox.minY;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const rect: [number, number, number, number] = [
    clamp01((rawBbox.minX + shape.snapDx * w) / width),
    clamp01((rawBbox.minY + shape.snapDy * h) / height),
    clamp01((rawBbox.maxX + shape.snapDx * w) / width),
    clamp01((rawBbox.maxY + shape.snapDy * h) / height),
  ];
  // Raw readings are the v4 measurements (features for calibration/training), whichever algorithm decided.
  return {
    optionIndex: b.optionIndex,
    fillRatio: m.fill,
    redoRatio: m.redoRatio,
    state: chosen.state,
    shape,
    ...classifiedExtras(chosen),
    alt: { algorithm: otherAlgorithm, state: other.state, ...classifiedExtras(other) },
    rect,
  };
}

/** One exercise's result from its box readings. */
function exerciseResult(
  exerciseId: string,
  pageIndex: number,
  bubbleReadings: OmrBubbleReading[],
  answerKey: OmrExerciseAnswerKey | undefined,
  alignmentUncertain: boolean
): OmrExerciseResult {
  // An ambiguous box counts by its provisional (closer) reading until a teacher verifies it.
  const selectedOptions = bubbleReadings
    .filter((r) => r.state === 'marked' || r.state === 'redone' || (r.state === 'ambiguous' && r.provisional !== false))
    .map((r) => r.optionIndex);
  // A shape reason flags the box even when it was resolved (e.g. solid → undone): the detector changed or doubted the fill-ratio reading, so a human confirms it.
  const flaggedOptions = bubbleReadings
    .filter((r) => r.state === 'ambiguous' || (r.reasons?.length ?? 0) > 0)
    .map((r) => r.optionIndex);

  const questionType = answerKey?.questionType ?? 'mc';
  const isSingleAnswerMultiMark = (questionType === 'sc' || questionType === 'tf') && selectedOptions.length > 1;
  const rawConfidence: 'high' | 'ambiguous' = flaggedOptions.length > 0 || isSingleAnswerMultiMark ? 'ambiguous' : 'high';
  const confidence = alignmentUncertain ? 'ambiguous' : rawConfidence;

  const score = answerKey
    ? computeMcScore(answerKey.questionType, selectedOptions, answerKey.correctAnswers, answerKey.penalty, answerKey.maxPoints)
    : 0;

  return {
    exerciseId,
    pageIndex,
    selectedOptions,
    score,
    confidence,
    flaggedOptions,
    bubbles: bubbleReadings,
    ...(alignmentUncertain ? { alignmentUncertain: true } : {}),
  };
}

/** Without alignment nothing can be read: every box blank, the exercise `failed`. */
function failedResult(exerciseId: string, pageIndex: number, bubbleRects: OmrPageTemplate['bubbles']): OmrExerciseResult {
  return {
    exerciseId,
    pageIndex,
    selectedOptions: [],
    score: 0,
    confidence: 'failed',
    flaggedOptions: [],
    bubbles: bubbleRects.map((b) => ({ optionIndex: b.optionIndex, fillRatio: 0, state: 'blank' as const, rect: [0, 0, 0, 0] })),
  };
}

function processPage(req: OmrWorkerRequest): OmrWorkerResponse {
  const { imageData, pageTemplate, scanScale, answerKeys } = req;
  const params = normalizeOmrParams(req.params);
  const { width, height } = imageData;
  const reg = registerPage(imageData, pageTemplate, scanScale, params);
  const quality = alignmentQuality(reg, pageTemplate, scanScale, width, height, params);
  const scan: PageScan | null = reg.H
    ? {
        gray: reg.gray,
        dark: reg.dark,
        width,
        height,
        threshold: reg.threshold,
        blackRef: blackReference(reg.hist, reg.gray.length),
        H: reg.H,
        scanScale,
        pageHeightPt: pageTemplate.pageHeightPt,
        params,
      }
    : null;

  const byExercise = new Map<string, OmrPageTemplate['bubbles']>();
  for (const bubble of pageTemplate.bubbles) {
    const list = byExercise.get(bubble.exerciseId) ?? [];
    list.push(bubble);
    byExercise.set(bubble.exerciseId, list);
  }
  const answerKeyById = new Map(answerKeys.map((k) => [k.exerciseId, k]));
  const results: OmrExerciseResult[] = [];
  for (const [exerciseId, bubbleRects] of byExercise) {
    bubbleRects.sort((a, b) => a.optionIndex - b.optionIndex);
    if (!scan) {
      results.push(failedResult(exerciseId, pageTemplate.pageIndex, bubbleRects));
      continue;
    }
    const measured = measureBubbles(scan, bubbleRects);
    const readings = measured.map((_, i) => classifyBubble(measured, i, scan));
    results.push(exerciseResult(exerciseId, pageTemplate.pageIndex, readings, answerKeyById.get(exerciseId), quality.uncertain));
  }

  return {
    type: 'OMR_RESULT',
    results,
    alignmentFailed: reg.H === null,
    alignmentUncertain: quality.uncertain,
    fiducialsFound: reg.fiducialsFound,
    fiducialCorners: reg.fiducialCorners,
    pageStats: {
      otsuThreshold: reg.threshold,
      fiducialsFound: reg.fiducialsFound,
      fiducialCorners: reg.fiducialCorners,
      ...(quality.residualFraction !== undefined ? { residualFraction: quality.residualFraction } : {}),
      ...(quality.ratioDiff !== undefined ? { ratioDiff: quality.ratioDiff } : {}),
      ...(quality.angleDeg !== undefined ? { angleDeg: quality.angleDeg } : {}),
    },
  };
}

self.onmessage = (event: MessageEvent<OmrWorkerRequest | OmrRegisterRequest>) => {
  if (event.data.type === 'REGISTER_PAGE') {
    handleRegister(event.data);
    return;
  }
  try {
    self.postMessage(processPage(event.data));
  } catch (err: any) {
    self.postMessage({ type: 'ERROR', message: err.message || 'OMR processing failed' });
  }
};
