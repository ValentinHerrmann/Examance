import { loadScoresEncrypted } from "$lib/db/dbEncryption";
import { loadExamMcExercises } from "$lib/grading/mcExerciseHash";
import { submissionRepository } from "$lib/repositories/submissionRepository";
import { studentRepository } from "$lib/repositories/studentRepository";
import { ensure64CharHex } from "$lib/crypto/hmac";
import type { ExerciseRecord } from "$lib/db/schema";

export interface McDetectionItem {
  submissionId: string;
  exerciseId: string;
  studentLabel: string;
  exerciseLabel: string;
  confidence: "high" | "ambiguous" | "failed";
  source: "omr" | "manual";
  flaggedOptions: number[];
  selectedOptions: number[];
  /**
   * Number of individual marked bubbles this item represents — a "detection"
   * is a single mark on the bubble sheet, not a whole question. A failed
   * alignment always counts as 1 (the unreadable region itself still needs a
   * human to look at it, even though no bubbles could be read).
   */
  markedCount: number;
  original?: {
    confidence: "high" | "ambiguous" | "failed";
    selectedOptions: number[];
    score?: number;
    flaggedOptions?: number[];
  };
  reviewedAt?: string;
  isReviewed?: boolean;
  isCorrected?: boolean;
}

export type McQueueCategory = "failed" | "unsure" | "confident";

/**
 * Single source of truth for which verification queue an item belongs to.
 * Both the dashboard (routes/exam/[id]/verify) and the per-item verify view
 * (routes/exam/[id]/verify-item) must use this — filtering separately let the
 * two drift apart (e.g. the "confident" queue's Next/Prev walking into
 * unsure/failed items because its own filter didn't match the dashboard's).
 */
export function categorizeMcItem(item: McDetectionItem): McQueueCategory {
  if (item.confidence === "failed") return "failed";
  if (item.confidence === "ambiguous" || item.flaggedOptions.length > 0) return "unsure";
  return "confident";
}

export interface DetectionConfidenceQuality {
  total: number;
  reviewed: number;
  confirmedUnchanged: number;
  corrected: number;
  accuracyRate: number; // percentage (0-100)
}

export interface DetectionQualityStats {
  totalWithHistory: number;
  totalReviewed: number;
  overallInitialAccuracy: number; // percentage (0-100)
  overallConfirmedUnchanged: number;
  highConfidence: DetectionConfidenceQuality;
  ambiguousConfidence: DetectionConfidenceQuality;
  failedConfidence: DetectionConfidenceQuality;
  falseConfidenceCount: number;
  falseConfidenceRate: number; // percentage (0-100)
}

export interface ConfusionBucket {
  count: number;
  /** Percentage of `totalOptionsEvaluated` — one shared denominator across all 8 buckets. */
  percent: number;
}

/**
 * Per-OPTION (bubble) classification of OMR reliability — distinct from
 * `DetectionQualityStats`, which operates per-QUESTION. "Positive" = the
 * option OMR originally called selected (`original.selectedOptions`);
 * "negative" = OMR originally called it blank. Ground truth is the human's
 * final selection (current `selectedOptions`) once an item is reviewed; for
 * unreviewed items there is no ground truth yet, so those options are
 * bucketed by OMR's original call crossed with whether OMR itself flagged
 * that specific option as visually uncertain (`original.flaggedOptions`,
 * genuine per-option data, not borrowed from question-level confidence).
 *
 * Excludes: items with `confidence === 'failed'` (no bubbles were actually
 * read) and items with no `original` snapshot (pure-manual entries that
 * never went through OMR — nothing to grade).
 */
export interface DetectionConfusionMatrix {
  totalOptionsEvaluated: number;
  correctPositive: ConfusionBucket;
  falsePositive: ConfusionBucket;
  correctNegative: ConfusionBucket;
  falseNegative: ConfusionBucket;
  unreviewedPositiveHigh: ConfusionBucket;
  unreviewedPositiveLow: ConfusionBucket;
  unreviewedNegativeHigh: ConfusionBucket;
  unreviewedNegativeLow: ConfusionBucket;
}

export interface McExerciseBreakdown {
  exerciseId: string;
  exerciseLabel: string;
  /** Questions (submission × this exercise) at each confidence level — matches the queues. */
  high: number;
  ambiguous: number;
  failed: number;
  total: number;
  /** Physically marked bubbles across all submissions of this exercise, informational only. */
  markedBoxes: number;
}

export interface McVerificationStats {
  /**
   * Question-level counts — one per (submission, exercise) pair, exactly what
   * the "Failed" / "Unsure" / "High confidence" queues below list and what
   * `Verify Item` steps through. This is the number that answers "how many
   * things do I still need to look at", so it must not scale with how many
   * bubbles happen to be marked on any one question — a high-confidence
   * 4-answer MC tick is exactly as "1 thing to check" as a blank one.
   */
  totalQuestions: number;
  highQuestions: number;
  ambiguousQuestions: number;
  failedQuestions: number;
  /**
   * Physically marked bubbles across the whole exam — informational total,
   * shown alongside the question counts but never as the headline "needs
   * review" number, since a routine, unambiguous multi-select answer
   * inflates it without needing any verification at all.
   */
  totalMarkedBoxes: number;
  perExercise: McExerciseBreakdown[];
  items: McDetectionItem[];
  qualityStats: DetectionQualityStats;
  confusionMatrix: DetectionConfusionMatrix;
}

/**
 * `items` lists one entry per (submission, MC/SC/TF exercise) pair — that's the
 * granularity the verification *queues* work at, since a human reviews a whole
 * question (and its scan crop) at once. An exam with 30 students × 5 MC
 * questions produces up to 150 items here, not 30 (submissions) or 1 (exam).
 *
 * `totalQuestions`/`highQuestions`/`ambiguousQuestions`/`failedQuestions` count
 * at this same item granularity — one per question, regardless of how many
 * bubbles were marked on it. `totalMarkedBoxes` (and each exercise's
 * `markedBoxes`) is the other axis: a sum of `markedCount`, one per
 * physically-marked bubble. Do not conflate the two — swapping the headline
 * "needs review" numbers to box counts is what made them scale with
 * marks-per-question independent of confidence, which is the bug these two
 * separate sets of fields exist to prevent regressing into.
 */
export async function computeMcVerificationStats(
  examId: string,
  key: CryptoKey | null
): Promise<McVerificationStats> {
  const [exercises, submissions, students] = await Promise.all([
    loadExamMcExercises(examId, key),
    submissionRepository.getByExamId(examId, key),
    studentRepository.getByExamId(examId, key),
  ]);

  const exerciseById = new Map<string, ExerciseRecord>(exercises.map((e) => [e.id, e]));

  const studentMap = new Map<string, string>();
  for (const st of students) {
    const label = st.studentName || st.fallbackCode || "";
    if (!label) continue;
    if (st.pseudonymId) {
      studentMap.set(st.pseudonymId, label);
      studentMap.set(await ensure64CharHex(st.pseudonymId), label);
    }
    if (st.fallbackCode) studentMap.set(st.fallbackCode, label);
  }

  async function labelFor(sub: { pseudonymHash: string; id: string }): Promise<string> {
    const direct = studentMap.get(sub.pseudonymHash);
    if (direct) return direct;
    const hex = await ensure64CharHex(sub.pseudonymHash);
    return studentMap.get(hex) || `Unmatched (${sub.id.slice(0, 8)})`;
  }

  const items: McDetectionItem[] = [];
  for (const sub of submissions) {
    const rawScores = await loadScoresEncrypted(sub.id, key);
    const label = await labelFor(sub);

    // Defensive: there should be at most one score row per (submission, exercise),
    // but nothing enforces that at the storage layer (ingestion `put()`s a fresh
    // id every time). If a submission was ever re-ingested, stale duplicate rows
    // would otherwise be counted as separate questions/boxes here, inflating
    // every total. Keep the last one per exercise, preferring a manual
    // correction over a raw OMR read if both exist.
    const scoreByExercise = new Map<string, (typeof rawScores)[number]>();
    for (const sc of rawScores) {
      const existing = scoreByExercise.get(sc.exerciseId);
      if (!existing || existing.omrMeta?.source !== "manual") {
        scoreByExercise.set(sc.exerciseId, sc);
      }
    }

    for (const sc of scoreByExercise.values()) {
      const ex = exerciseById.get(sc.exerciseId);
      if (!ex || !sc.omrMeta) continue;
      const flaggedOptions = sc.omrMeta.flaggedOptions ?? [];
      const selectedOptions = sc.selectedOptions ?? [];

      const orig = sc.omrMeta.original ?? (sc.omrMeta.source === "omr" ? {
        confidence: sc.omrMeta.confidence,
        selectedOptions: [...selectedOptions],
        score: sc.score,
        flaggedOptions: flaggedOptions.length > 0 ? [...flaggedOptions] : undefined,
      } : undefined);

      const isReviewed = sc.omrMeta.source === "manual" || !!sc.omrMeta.reviewedAt;
      const isCorrected = orig && isReviewed ? !optionsEqual(orig.selectedOptions, selectedOptions) : false;

      items.push({
        submissionId: sub.id,
        exerciseId: sc.exerciseId,
        studentLabel: label,
        exerciseLabel: ex.title || ex.name || "MC Question",
        confidence: sc.omrMeta.confidence,
        source: sc.omrMeta.source,
        flaggedOptions,
        selectedOptions,
        markedCount: detectionMarkedCount(sc.omrMeta.confidence, selectedOptions, flaggedOptions),
        original: orig,
        reviewedAt: sc.omrMeta.reviewedAt,
        isReviewed,
        isCorrected,
      });
    }
  }

  const perExerciseMap = new Map<string, McExerciseBreakdown>();
  let totalQuestions = 0;
  let highQuestions = 0;
  let ambiguousQuestions = 0;
  let failedQuestions = 0;
  let totalMarkedBoxes = 0;

  let totalReviewed = 0;
  let overallConfirmedUnchanged = 0;
  let totalWithHistory = 0;

  const highQuality = { total: 0, reviewed: 0, confirmedUnchanged: 0, corrected: 0, accuracyRate: 100 };
  const ambiguousQuality = { total: 0, reviewed: 0, confirmedUnchanged: 0, corrected: 0, accuracyRate: 100 };
  const failedQuality = { total: 0, reviewed: 0, confirmedUnchanged: 0, corrected: 0, accuracyRate: 100 };

  for (const it of items) {
    let b = perExerciseMap.get(it.exerciseId);
    if (!b) {
      b = { exerciseId: it.exerciseId, exerciseLabel: it.exerciseLabel, high: 0, ambiguous: 0, failed: 0, total: 0, markedBoxes: 0 };
      perExerciseMap.set(it.exerciseId, b);
    }
    b[it.confidence] += 1;
    b.total += 1;
    b.markedBoxes += it.markedCount;

    totalQuestions += 1;
    totalMarkedBoxes += it.markedCount;
    if (it.confidence === "high") highQuestions += 1;
    else if (it.confidence === "ambiguous") ambiguousQuestions += 1;
    else failedQuestions += 1;

    // Quality stats based on initial detection before verification
    const origConf = it.original?.confidence ?? it.confidence;
    if (it.original) {
      totalWithHistory += 1;
    }

    const bucket =
      origConf === "high"
        ? highQuality
        : origConf === "ambiguous"
        ? ambiguousQuality
        : failedQuality;

    bucket.total += 1;

    if (it.isReviewed) {
      totalReviewed += 1;
      bucket.reviewed += 1;
      if (it.isCorrected) {
        bucket.corrected += 1;
      } else {
        bucket.confirmedUnchanged += 1;
        overallConfirmedUnchanged += 1;
      }
    }
  }

  function calcRate(confirmed: number, reviewed: number): number {
    if (reviewed === 0) return 100;
    return Math.round((confirmed / reviewed) * 1000) / 10;
  }

  highQuality.accuracyRate = calcRate(highQuality.confirmedUnchanged, highQuality.reviewed);
  ambiguousQuality.accuracyRate = calcRate(ambiguousQuality.confirmedUnchanged, ambiguousQuality.reviewed);
  failedQuality.accuracyRate = calcRate(failedQuality.confirmedUnchanged, failedQuality.reviewed);

  const overallInitialAccuracy = calcRate(overallConfirmedUnchanged, totalReviewed);
  const falseConfidenceCount = highQuality.corrected;
  const falseConfidenceRate =
    highQuality.reviewed > 0
      ? Math.round((falseConfidenceCount / highQuality.reviewed) * 1000) / 10
      : 0;

  const qualityStats: DetectionQualityStats = {
    totalWithHistory,
    totalReviewed,
    overallInitialAccuracy,
    overallConfirmedUnchanged,
    highConfidence: highQuality,
    ambiguousConfidence: ambiguousQuality,
    failedConfidence: failedQuality,
    falseConfidenceCount,
    falseConfidenceRate,
  };

  const confusionMatrix = buildConfusionMatrix(items, exerciseById);

  return {
    totalQuestions,
    highQuestions,
    ambiguousQuestions,
    failedQuestions,
    totalMarkedBoxes,
    perExercise: Array.from(perExerciseMap.values()),
    items,
    qualityStats,
    confusionMatrix,
  };
}

/**
 * Classifies every OMR-evaluated OPTION (not question) into the confusion
 * matrix described on `DetectionConfusionMatrix`. Kept as its own pass over
 * `items`, since it groups by option index within each item rather than by
 * item itself.
 */
function buildConfusionMatrix(
  items: McDetectionItem[],
  exerciseById: Map<string, ExerciseRecord>
): DetectionConfusionMatrix {
  let correctPositive = 0;
  let falsePositive = 0;
  let correctNegative = 0;
  let falseNegative = 0;
  let unreviewedPositiveHigh = 0;
  let unreviewedPositiveLow = 0;
  let unreviewedNegativeHigh = 0;
  let unreviewedNegativeLow = 0;

  for (const it of items) {
    if (it.confidence === "failed" || !it.original) continue;
    const optionCount = exerciseById.get(it.exerciseId)?.options?.length ?? 0;
    const origSelected = new Set(it.original.selectedOptions);
    const origFlagged = new Set(it.original.flaggedOptions ?? []);
    const finalSelected = new Set(it.selectedOptions);

    for (let idx = 0; idx < optionCount; idx++) {
      const omrPositive = origSelected.has(idx);
      if (it.isReviewed) {
        const finalPositive = finalSelected.has(idx);
        if (omrPositive && finalPositive) correctPositive += 1;
        else if (omrPositive && !finalPositive) falsePositive += 1;
        else if (!omrPositive && !finalPositive) correctNegative += 1;
        else falseNegative += 1;
      } else {
        const lowConfidence = origFlagged.has(idx);
        if (omrPositive && !lowConfidence) unreviewedPositiveHigh += 1;
        else if (omrPositive && lowConfidence) unreviewedPositiveLow += 1;
        else if (!omrPositive && !lowConfidence) unreviewedNegativeHigh += 1;
        else unreviewedNegativeLow += 1;
      }
    }
  }

  const totalOptionsEvaluated =
    correctPositive +
    falsePositive +
    correctNegative +
    falseNegative +
    unreviewedPositiveHigh +
    unreviewedPositiveLow +
    unreviewedNegativeHigh +
    unreviewedNegativeLow;

  const pct = (count: number): number =>
    totalOptionsEvaluated === 0 ? 0 : Math.round((count / totalOptionsEvaluated) * 1000) / 10;

  return {
    totalOptionsEvaluated,
    correctPositive: { count: correctPositive, percent: pct(correctPositive) },
    falsePositive: { count: falsePositive, percent: pct(falsePositive) },
    correctNegative: { count: correctNegative, percent: pct(correctNegative) },
    falseNegative: { count: falseNegative, percent: pct(falseNegative) },
    unreviewedPositiveHigh: { count: unreviewedPositiveHigh, percent: pct(unreviewedPositiveHigh) },
    unreviewedPositiveLow: { count: unreviewedPositiveLow, percent: pct(unreviewedPositiveLow) },
    unreviewedNegativeHigh: { count: unreviewedNegativeHigh, percent: pct(unreviewedNegativeHigh) },
    unreviewedNegativeLow: { count: unreviewedNegativeLow, percent: pct(unreviewedNegativeLow) },
  };
}

function optionsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

/**
 * Number of physically marked bubbles a single (submission, exercise) score
 * represents. A failed alignment always counts as 1 — there are no readable
 * bubbles, but the region still needs a human to look at it — everything else
 * is the count of distinct options either selected or flagged as uncertain
 * (a bubble can be flagged without being counted as selected, e.g. a faint
 * mark the algorithm chose not to score but still wants a human to confirm).
 */
function detectionMarkedCount(
  confidence: "high" | "ambiguous" | "failed",
  selectedOptions: number[],
  flaggedOptions: number[]
): number {
  if (confidence === "failed") return 1;
  return new Set([...selectedOptions, ...flaggedOptions]).size;
}
