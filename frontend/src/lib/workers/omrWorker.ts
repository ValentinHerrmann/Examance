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

self.onmessage = (event: MessageEvent<OmrWorkerRequest | OmrRegisterRequest>) => {
  if (event.data.type === 'REGISTER_PAGE') {
    handleRegister(event.data);
    return;
  }
  const { imageData, pageTemplate, scanScale, answerKeys } = event.data;
  const params = normalizeOmrParams(event.data.params);
  try {
    const { width, height } = imageData;
    const { gray, hist, threshold, dark, srcPts, dstPts, fiducialsFound, fiducialCorners, H } = registerPage(
      imageData,
      pageTemplate,
      scanScale,
      params
    );
    const blackRef = blackReference(hist, gray.length);
    const alignmentFailed = H === null;

    let alignmentUncertain = false;
    let residualFraction: number | undefined;
    let ratioDiffStat: number | undefined;
    let angleDegStat: number | undefined;
    if (!alignmentFailed && H) {
      if (fiducialsFound === 3) {
        alignmentUncertain = true;
      } else if (fiducialsFound >= 4) {
        const affine = buildAffine3(srcPts.slice(0, 3), dstPts.slice(0, 3));
        if (!affine) {
          alignmentUncertain = true;
        } else {
          const [mX, mY] = transformPoint(affine, srcPts[3][0], srcPts[3][1]);
          const residual = Math.hypot(mX - dstPts[3][0], mY - dstPts[3][1]);
          residualFraction = width > 0 ? residual / width : undefined;
          if (residual > params.alignResidualFraction * width) {
            alignmentUncertain = true;
          }
        }

        // Map template page's corners through H
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
        const bottomLen = Math.hypot(vBottom[0], vBottom[1]);
        const leftLen = Math.hypot(vLeft[0], vLeft[1]);
        const rightLen = Math.hypot(vRight[0], vRight[1]);

        const mappedW = (topLen + bottomLen) / 2;
        const mappedH = (leftLen + rightLen) / 2;

        if (mappedW <= 0 || mappedH <= 0 || width <= 0 || height <= 0) {
          alignmentUncertain = true;
        } else {
          // A correct registration maps the page onto the scan without distorting its aspect ratio. Compare against the page itself, not the scan image — a scanner bed larger than the sheet changes the image's ratio, not the page's.
          const mappedRatio = mappedW / mappedH;
          const pageRatio = expW / expH;
          const ratioDiff = Math.abs(mappedRatio - pageRatio) / pageRatio;
          ratioDiffStat = ratioDiff;
          if (ratioDiff > params.alignRatioTolerance) {
            alignmentUncertain = true;
          }

          if (topLen > 0 && leftLen > 0) {
            const dot = vTop[0] * vLeft[0] + vTop[1] * vLeft[1];
            const cosAngle = Math.max(-1, Math.min(1, dot / (topLen * leftLen)));
            const angleDeg = (Math.acos(cosAngle) * 180) / Math.PI;
            angleDegStat = angleDeg;
            if (Math.abs(angleDeg - 90) > params.alignAngleToleranceDeg) {
              alignmentUncertain = true;
            }
          } else {
            alignmentUncertain = true;
          }
        }
      }
    }

    const byExercise = new Map<string, OmrPageTemplate['bubbles']>();
    for (const bubble of pageTemplate.bubbles) {
      const list = byExercise.get(bubble.exerciseId) ?? [];
      list.push(bubble);
      byExercise.set(bubble.exerciseId, list);
    }

    const answerKeyById = new Map(answerKeys.map((k) => [k.exerciseId, k]));
    const results: OmrExerciseResult[] = [];

    for (const [exerciseId, bubbleRects] of byExercise) {
      const answerKey = answerKeyById.get(exerciseId);
      bubbleRects.sort((a, b) => a.optionIndex - b.optionIndex);

      if (alignmentFailed || !H) {
        results.push({
          exerciseId,
          pageIndex: pageTemplate.pageIndex,
          selectedOptions: [],
          score: 0,
          confidence: 'failed',
          flaggedOptions: [],
          bubbles: bubbleRects.map((b) => ({
            optionIndex: b.optionIndex,
            fillRatio: 0,
            state: 'blank' as const,
            rect: [0, 0, 0, 0],
          })),
        });
        continue;
      }

      // Pass 1: measure every box both ways — v4 (local threshold, border snapping, strokes) and v2 (global Otsu, template rect). Spill needs every sibling's ring before classifying.
      const measured = bubbleRects.map((b) => {
        const bbox = bubbleBBoxInImage(H, b.rect, scanScale, pageTemplate.pageHeightPt);
        const redoBbox = b.redoRect
          ? bubbleBBoxInImage(H, effectiveRedoRect(b.rect, b.redoRect), scanScale, pageTemplate.pageHeightPt)
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

      const bubbleReadings: OmrBubbleReading[] = measured.map(({ b, bbox: rawBbox, m, v2 }, i) => {
        const others = measured.filter((_, j) => j !== i);
        const spill = (own: number, rings: number[]) => (rings.length > 0 ? { spillExcess: own - median(rings) } : {});
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
        const { state, reasons, provisional } = chosen;
        // Raw readings are the v4 measurements (features for calibration/training), whichever algorithm decided.
        const ratio = m.fill;
        const redoRatio = m.redoRatio;

        // Report the box where the printed border actually is (snapped), not the raw template position — the viewer's overlay and any crop then sit on the real box.
        const w = rawBbox.maxX - rawBbox.minX;
        const h = rawBbox.maxY - rawBbox.minY;
        const bbox = {
          minX: rawBbox.minX + shape.snapDx * w,
          maxX: rawBbox.maxX + shape.snapDx * w,
          minY: rawBbox.minY + shape.snapDy * h,
          maxY: rawBbox.maxY + shape.snapDy * h,
        };
        const rect: [number, number, number, number] = [
          Math.min(1, Math.max(0, bbox.minX / width)),
          Math.min(1, Math.max(0, bbox.minY / height)),
          Math.min(1, Math.max(0, bbox.maxX / width)),
          Math.min(1, Math.max(0, bbox.maxY / height)),
        ];
        return {
          optionIndex: b.optionIndex,
          fillRatio: ratio,
          redoRatio,
          state,
          shape,
          ...(reasons.length > 0 ? { reasons } : {}),
          ...(provisional !== undefined ? { provisional } : {}),
          alt: {
            algorithm: otherAlgorithm,
            state: other.state,
            ...(other.reasons.length > 0 ? { reasons: other.reasons } : {}),
            ...(other.provisional !== undefined ? { provisional: other.provisional } : {}),
          },
          rect,
        };
      });

      // An ambiguous box counts by its provisional (closer) reading until a teacher verifies it.
      const selectedOptions = bubbleReadings
        .filter((r) => r.state === 'marked' || r.state === 'redone' || (r.state === 'ambiguous' && r.provisional !== false))
        .map((r) => r.optionIndex);
      // A shape reason flags the box even when it was resolved (e.g. solid → undone): the detector changed or doubted the fill-ratio reading, so a human confirms it.
      const flaggedOptions = bubbleReadings
        .filter((r) => r.state === 'ambiguous' || (r.reasons?.length ?? 0) > 0)
        .map((r) => r.optionIndex);

      const questionType = answerKey?.questionType ?? 'mc';
      const isSingleAnswerMultiMark =
        (questionType === 'sc' || questionType === 'tf') && selectedOptions.length > 1;

      const rawConfidence: 'high' | 'ambiguous' | 'failed' =
        flaggedOptions.length > 0 || isSingleAnswerMultiMark ? 'ambiguous' : 'high';
      const confidence: 'high' | 'ambiguous' | 'failed' =
        alignmentUncertain && rawConfidence === 'high' ? 'ambiguous' : rawConfidence;

      const score = answerKey
        ? computeMcScore(
            answerKey.questionType,
            selectedOptions,
            answerKey.correctAnswers,
            answerKey.penalty,
            answerKey.maxPoints
          )
        : 0;

      results.push({
        exerciseId,
        pageIndex: pageTemplate.pageIndex,
        selectedOptions,
        score,
        confidence,
        flaggedOptions,
        bubbles: bubbleReadings,
        ...(alignmentUncertain ? { alignmentUncertain: true } : {}),
      });
    }

    self.postMessage({
      type: 'OMR_RESULT',
      results,
      alignmentFailed,
      alignmentUncertain,
      fiducialsFound,
      fiducialCorners,
      pageStats: {
        otsuThreshold: threshold,
        fiducialsFound,
        fiducialCorners,
        ...(residualFraction !== undefined ? { residualFraction } : {}),
        ...(ratioDiffStat !== undefined ? { ratioDiff: ratioDiffStat } : {}),
        ...(angleDegStat !== undefined ? { angleDeg: angleDegStat } : {}),
      },
    });
  } catch (err: any) {
    self.postMessage({ type: 'ERROR', message: err.message || 'OMR processing failed' });
  }
};
