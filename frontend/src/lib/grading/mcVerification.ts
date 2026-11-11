import { scoreRepository } from "#lib/repositories/scoreRepository";
import { loadExamMcExercises } from "#lib/grading/mcExerciseHash";
import { buildSubLabelMap } from "#lib/grading/mcGroupLabels";
import { submissionRepository } from "#lib/repositories/submissionRepository";
import { studentRepository } from "#lib/repositories/studentRepository";
import { joinKey, joinKeys } from "#lib/crypto/pseudonymKey";
import { loadLocalMcGroups } from "#lib/db/dbEncryption";
import type { ExerciseRecord, OmrScoreMeta, SubmissionRecord } from "#lib/db/schema";
import type { OmrRunInfo } from "#lib/grading/omrSettings";
import { formatStudentName } from "#lib/utils/studentQr";
import { translate } from "#lib/i18n";

/** The one definition of "a teacher has verified this detection". A re-run must never touch a row for which this is true (issue #32), and the dashboard/queues count by it. */
export function isMcReviewed(omrMeta: Pick<OmrScoreMeta, "source" | "reviewedAt"> | undefined): boolean {
  return !!omrMeta && (omrMeta.source === "manual" || !!omrMeta.reviewedAt);
}

/** How each detection algorithm would have read the verified boxes: the deciding one (its stored `detectedState`/`provisional`) and the shadow one (`alt`). Lets a teacher see on their own sheets whether switching `params.algorithm` would help before switching. */
export interface McAlgorithmScore {
  algorithm: number;
  /** Verified boxes both algorithms were run on. */
  boxes: number;
  /** Provisional selection matched the teacher's verified selection. */
  correct: number;
  /** Boxes the algorithm flagged as unsure. */
  unsure: number;
}

type BoxVerdict = { state: string; reasons?: string[]; provisional?: boolean };
const verdictSelected = (v: BoxVerdict) =>
  v.state === "marked" || v.state === "redone" || (v.state === "ambiguous" && v.provisional !== false);
const verdictUnsure = (v: BoxVerdict) => v.state === "ambiguous" || (v.reasons?.length ?? 0) > 0;

/** Score rows grouped by the detection batch that produced them. `run === null` collects rows detected before run snapshots existed — their settings are unknown, not "the defaults". */
export interface McDetectionRunSummary {
  run: OmrRunInfo | null;
  itemCount: number;
  reviewedCount: number;
}

/** How many items were read with one OMR template (issue #239): a pin (`pinnedAt`), the current layout (hash only) or unrecorded (neither). */
export interface McTemplateUsage {
  hash?: string;
  pinnedAt?: string;
  itemCount: number;
}

/** How sure the OMR was about one question. */
export type McConfidence = "high" | "ambiguous" | "failed";

export interface McDetectionItem {
  submissionId: string;
  exerciseId: string;
  studentLabel: string;
  exerciseLabel: string;
  confidence: McConfidence;
  source: "omr" | "manual";
  flaggedOptions: number[];
  selectedOptions: number[];
    /** Marked bubbles this item represents (a detection is one mark, not a question); a failed alignment counts as 1 since the region still needs a human. */
  markedCount: number;
  original?: {
    confidence: McConfidence;
    selectedOptions: number[];
    score?: number;
    flaggedOptions?: number[];
  };
  reviewedAt?: string;
  isReviewed?: boolean;
  isCorrected?: boolean;
  /** Detection batch that produced this item; undefined for legacy rows. */
  run?: OmrRunInfo;
}

export type McQueueCategory = "failed" | "unsure" | "confident";

/** Single source of truth for which verification queue an item belongs to; the verify dashboard and item view both go through it (`mcQueue`), or the queues' Next/Prev drift from the dashboard. */
export function categorizeMcItem(item: McDetectionItem): McQueueCategory {
  if (item.confidence === "failed") return "failed";
  if (item.confidence === "ambiguous" || item.flaggedOptions.length > 0) return "unsure";
  return "confident";
}

/** The items of one verification queue, in dashboard order. */
export function mcQueue(items: McDetectionItem[], category: McQueueCategory): McDetectionItem[] {
  return items.filter((i) => categorizeMcItem(i) === category);
}

/** What the MC step shows: open failed/unsure items and the sure ones looked at. */
export interface McCheckSummary {
  open: number;
  sureTotal: number;
  sureReviewed: number;
}

export function summarizeMcCheck(items: McDetectionItem[]): McCheckSummary {
  const sure = mcQueue(items, "confident");
  return {
    open: [...mcQueue(items, "failed"), ...mcQueue(items, "unsure")].filter((i) => !i.isReviewed).length,
    sureTotal: sure.length,
    sureReviewed: sure.filter((i) => i.isReviewed).length,
  };
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

/** Per-OPTION (bubble) classification of OMR reliability, unlike per-QUESTION `DetectionQualityStats`. Ground truth is the human's final selection; unreviewed items are bucketed by OMR's original call crossed with `flaggedOptions`. Excludes `failed` items and items without an `original` snapshot (pure-manual entries). */
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
    /** Question-level counts, one per (submission, exercise): what the queues list and `Verify Item` steps through. Must not scale with marked bubbles per question. */
  totalQuestions: number;
  highQuestions: number;
  ambiguousQuestions: number;
  failedQuestions: number;
    /** Physically marked bubbles across the exam: informational only, never the headline "needs review" number. */
  totalMarkedBoxes: number;
  perExercise: McExerciseBreakdown[];
  items: McDetectionItem[];
  qualityStats: DetectionQualityStats;
  confusionMatrix: DetectionConfusionMatrix;
  /** Newest run first; the legacy (`run: null`) bucket, if any, last. */
  detectionRuns: McDetectionRunSummary[];
  templatesUsed: McTemplateUsage[];
  /** MC score rows without any detection (typed in by hand) — a re-run leaves them alone. */
  undetectedScoreCount: number;
  /** Per-algorithm accuracy on verified boxes that carry both verdicts; empty before any. */
  algorithmComparison: McAlgorithmScore[];
}

type ScoreRow = Awaited<ReturnType<typeof scoreRepository.getByExamId>>[number];
type StudentRow = Awaited<ReturnType<typeof studentRepository.getByExamId>>[number];

/** Display label per joined pseudonym key and per fallback code. */
async function studentLabelMap(students: StudentRow[]): Promise<Map<string, string>> {
  const studentMap = new Map<string, string>();
  const studentKeys = await joinKeys(students);
  students.forEach((st, i) => {
    const label = formatStudentName(st.studentName) || st.fallbackCode || "";
    if (!label) return;
    if (st.pseudonymHmac) studentMap.set(studentKeys[i], label);
    if (st.fallbackCode) studentMap.set(st.fallbackCode, label);
  });
  return studentMap;
}

async function submissionLabel(sub: SubmissionRecord, studentMap: Map<string, string>): Promise<string> {
  const label = sub.pseudonymHmac ? studentMap.get(await joinKey(sub)) : undefined;
  return label || translate("scanning.verifyItem.submissionLabelFallback", { shortId: sub.id.slice(0, 8) });
}

/** One read for the exam, then grouped in memory, to avoid an N+1 network read per submission now that scores are server-side. */
function groupBySubmission(allScores: ScoreRow[]): Map<string, ScoreRow[]> {
  const scoresBySubmission = new Map<string, ScoreRow[]>();
  for (const sc of allScores) {
    const bucket = scoresBySubmission.get(sc.submissionId);
    if (bucket) bucket.push(sc);
    else scoresBySubmission.set(sc.submissionId, [sc]);
  }
  return scoresBySubmission;
}

/** Defensive: storage doesn't enforce one score row per (submission, exercise) and a re-ingest can leave stale duplicates that would inflate totals. Keeps the last per exercise, preferring a manual correction over a raw OMR read. */
function lastScorePerExercise(rawScores: ScoreRow[]): Map<string, ScoreRow> {
  const scoreByExercise = new Map<string, ScoreRow>();
  for (const sc of rawScores) {
    const existing = scoreByExercise.get(sc.exerciseId);
    if (!existing || existing.omrMeta?.source !== "manual") {
      scoreByExercise.set(sc.exerciseId, sc);
    }
  }
  return scoreByExercise;
}

type BoxTally = (algorithm: number, verdict: BoxVerdict, label: boolean) => void;

/** Feeds the per-algorithm comparison from a reviewed score's boxes that carry both verdicts. */
function tallyReviewedBoxes(omrMeta: OmrScoreMeta, selectedOptions: number[], tally: BoxTally): void {
  const decidedBy = omrMeta.run?.algorithmVersion;
  if (!isMcReviewed(omrMeta) || decidedBy === undefined) return;
  for (const b of omrMeta.detections?.bubbles ?? []) {
    if (!b.alt || !b.detectedState) continue;
    const label = selectedOptions.includes(b.optionIndex);
    tally(decidedBy, { state: b.detectedState, reasons: b.reasons, provisional: b.provisional }, label);
    tally(b.alt.algorithm, b.alt, label);
  }
}

function detectionItem(
  sub: SubmissionRecord,
  studentLabel: string,
  sc: ScoreRow,
  omrMeta: OmrScoreMeta,
  ex: ExerciseRecord,
  subLetterById: Map<string, string>
): McDetectionItem {
  const flaggedOptions = omrMeta.flaggedOptions ?? [];
  const selectedOptions = sc.selectedOptions ?? [];

  const orig = omrMeta.original ?? (omrMeta.source === "omr" ? {
    confidence: omrMeta.confidence,
    selectedOptions: [...selectedOptions],
    score: sc.score,
    flaggedOptions: flaggedOptions.length > 0 ? [...flaggedOptions] : undefined,
  } : undefined);

  const isReviewed = isMcReviewed(omrMeta);
  const isCorrected = !!orig && isReviewed && !optionsEqual(orig.selectedOptions, selectedOptions);
  const title = ex.title || ex.name || "MC Question";

  return {
    submissionId: sub.id,
    exerciseId: sc.exerciseId,
    studentLabel,
    exerciseLabel: subLetterById.has(sc.exerciseId) ? `${title} ${subLetterById.get(sc.exerciseId)})` : title,
    confidence: omrMeta.confidence,
    source: omrMeta.source,
    flaggedOptions,
    selectedOptions,
    markedCount: detectionMarkedCount(omrMeta.confidence, selectedOptions, flaggedOptions),
    original: orig,
    reviewedAt: omrMeta.reviewedAt,
    isReviewed,
    isCorrected,
    run: omrMeta.run,
  };
}

/** One item per (submission, MC exercise) score with a detection; hand-typed scores without one are only counted. */
function collectDetectionItems(
  submissions: SubmissionRecord[],
  labels: string[],
  scoresBySubmission: Map<string, ScoreRow[]>,
  exerciseById: Map<string, ExerciseRecord>,
  subLetterById: Map<string, string>,
  tally: BoxTally
): { items: McDetectionItem[]; undetectedScoreCount: number } {
  const items: McDetectionItem[] = [];
  let undetectedScoreCount = 0;
  submissions.forEach((sub, i) => {
    for (const sc of lastScorePerExercise(scoresBySubmission.get(sub.id) ?? []).values()) {
      const ex = exerciseById.get(sc.exerciseId);
      if (!ex) continue;
      if (!sc.omrMeta) {
        if (sc.score !== undefined) undetectedScoreCount++;
        continue;
      }
      tallyReviewedBoxes(sc.omrMeta, sc.selectedOptions ?? [], tally);
      items.push(detectionItem(sub, labels[i], sc, sc.omrMeta, ex, subLetterById));
    }
  });
  return { items, undetectedScoreCount };
}

function emptyQuality(): DetectionConfidenceQuality {
  return { total: 0, reviewed: 0, confirmedUnchanged: 0, corrected: 0, accuracyRate: 100 };
}

function calcRate(confirmed: number, reviewed: number): number {
  if (reviewed === 0) return 100;
  return Math.round((confirmed / reviewed) * 1000) / 10;
}

/** Question counts per confidence, per exercise and the quality of the initial detection (before verification). */
function summarizeQuestions(items: McDetectionItem[]) {
  const perExerciseMap = new Map<string, McExerciseBreakdown>();
  const counts = { total: 0, high: 0, ambiguous: 0, failed: 0, markedBoxes: 0 };
  let totalReviewed = 0;
  let overallConfirmedUnchanged = 0;
  let totalWithHistory = 0;
  const quality: Record<McConfidence, DetectionConfidenceQuality> = {
    high: emptyQuality(),
    ambiguous: emptyQuality(),
    failed: emptyQuality(),
  };

  for (const it of items) {
    let b = perExerciseMap.get(it.exerciseId);
    if (!b) {
      b = { exerciseId: it.exerciseId, exerciseLabel: it.exerciseLabel, high: 0, ambiguous: 0, failed: 0, total: 0, markedBoxes: 0 };
      perExerciseMap.set(it.exerciseId, b);
    }
    b[it.confidence] += 1;
    b.total += 1;
    b.markedBoxes += it.markedCount;

    counts.total += 1;
    counts.markedBoxes += it.markedCount;
    counts[it.confidence] += 1;

    if (it.original) totalWithHistory += 1;
    const bucket = quality[it.original?.confidence ?? it.confidence];
    bucket.total += 1;

    if (!it.isReviewed) continue;
    totalReviewed += 1;
    bucket.reviewed += 1;
    if (it.isCorrected) {
      bucket.corrected += 1;
    } else {
      bucket.confirmedUnchanged += 1;
      overallConfirmedUnchanged += 1;
    }
  }

  for (const bucket of Object.values(quality)) bucket.accuracyRate = calcRate(bucket.confirmedUnchanged, bucket.reviewed);

  const falseConfidenceCount = quality.high.corrected;
  const qualityStats: DetectionQualityStats = {
    totalWithHistory,
    totalReviewed,
    overallInitialAccuracy: calcRate(overallConfirmedUnchanged, totalReviewed),
    overallConfirmedUnchanged,
    highConfidence: quality.high,
    ambiguousConfidence: quality.ambiguous,
    failedConfidence: quality.failed,
    falseConfidenceCount,
    falseConfidenceRate:
      quality.high.reviewed > 0
        ? Math.round((falseConfidenceCount / quality.high.reviewed) * 1000) / 10
        : 0,
  };
  return { perExercise: Array.from(perExerciseMap.values()), counts, qualityStats };
}

/** `items` has one entry per (submission, MC/SC/TF exercise) pair; `*Questions` counts use that granularity, while `totalMarkedBoxes`/`markedBoxes` sum `markedCount` per marked bubble. Don't conflate them: box counts as headline numbers scaled with marks per question regardless of confidence. */
export async function computeMcVerificationStats(
  examId: string,
  key: CryptoKey | null
): Promise<McVerificationStats> {
  const [exercises, submissions, students, mcGroups] = await Promise.all([
    loadExamMcExercises(examId, key),
    submissionRepository.getByExamId(examId, key),
    studentRepository.getByExamId(examId, key),
    loadLocalMcGroups(examId).catch(() => []),
  ]);

  const exerciseById = new Map<string, ExerciseRecord>(exercises.map((e) => [e.id, e]));

  // Members of one MC group share a title; the sub-letter tells them apart.
  const subLetterById = buildSubLabelMap(mcGroups);

  const studentMap = await studentLabelMap(students);
  // Pure key derivations, so the labels resolve in parallel; `map` keeps the submission order.
  const labels = await Promise.all(submissions.map((sub) => submissionLabel(sub, studentMap)));
  const scoresBySubmission = groupBySubmission(await scoreRepository.getByExamId(examId, key));

  const algoScores = new Map<number, McAlgorithmScore>();
  const tally: BoxTally = (algorithm, verdict, label) => {
    const s = algoScores.get(algorithm) ?? { algorithm, boxes: 0, correct: 0, unsure: 0 };
    s.boxes++;
    if (verdictSelected(verdict) === label) s.correct++;
    if (verdictUnsure(verdict)) s.unsure++;
    algoScores.set(algorithm, s);
  };
  const { items, undetectedScoreCount } = collectDetectionItems(
    submissions,
    labels,
    scoresBySubmission,
    exerciseById,
    subLetterById,
    tally
  );

  const { perExercise, counts, qualityStats } = summarizeQuestions(items);

  return {
    totalQuestions: counts.total,
    highQuestions: counts.high,
    ambiguousQuestions: counts.ambiguous,
    failedQuestions: counts.failed,
    totalMarkedBoxes: counts.markedBoxes,
    perExercise,
    items,
    qualityStats,
    confusionMatrix: buildConfusionMatrix(items, exerciseById),
    detectionRuns: summarizeDetectionRuns(items),
    templatesUsed: summarizeTemplates(items),
    undetectedScoreCount,
    algorithmComparison: [...algoScores.values()].sort((a, b) => a.algorithm - b.algorithm),
  };
}

export function summarizeDetectionRuns(items: McDetectionItem[]): McDetectionRunSummary[] {
  const byId = new Map<string, McDetectionRunSummary>();
  let legacy: McDetectionRunSummary | null = null;
  for (const item of items) {
    let bucket: McDetectionRunSummary;
    if (item.run) {
      const existing = byId.get(item.run.runId);
      bucket = existing ?? { run: item.run, itemCount: 0, reviewedCount: 0 };
      if (!existing) byId.set(item.run.runId, bucket);
    } else {
      legacy ??= { run: null, itemCount: 0, reviewedCount: 0 };
      bucket = legacy;
    }
    bucket.itemCount++;
    if (item.isReviewed) bucket.reviewedCount++;
  }
  const runs = Array.from(byId.values()).sort((a, b) =>
    (b.run?.detectedAt ?? "").localeCompare(a.run?.detectedAt ?? "")
  );
  return legacy ? [...runs, legacy] : runs;
}

/** Items per template they were read with: pins newest first, then the current layout, then unrecorded. */
export function summarizeTemplates(items: Pick<McDetectionItem, "run">[]): McTemplateUsage[] {
  const byHash = new Map<string, McTemplateUsage>();
  for (const item of items) {
    const key = item.run?.templateHash ?? "";
    const usage = byHash.get(key) ?? { ...(key ? { hash: key } : {}), itemCount: 0 };
    if (item.run?.templatePinnedAt) usage.pinnedAt = item.run.templatePinnedAt;
    usage.itemCount++;
    byHash.set(key, usage);
  }
  const rank = (u: McTemplateUsage) => {
    if (u.pinnedAt) return 0;
    return u.hash ? 1 : 2;
  };
  return [...byHash.values()].sort((a, b) => rank(a) - rank(b) || (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? ""));
}

type ConfusionCell = Exclude<keyof DetectionConfusionMatrix, "totalOptionsEvaluated">;

const CONFUSION_CELLS: readonly ConfusionCell[] = [
  "correctPositive",
  "falsePositive",
  "correctNegative",
  "falseNegative",
  "unreviewedPositiveHigh",
  "unreviewedPositiveLow",
  "unreviewedNegativeHigh",
  "unreviewedNegativeLow",
];

/** Reviewed options are judged against the final selection, unreviewed ones against the OMR's own doubt (`flaggedOptions`). */
function confusionCell(omrPositive: boolean, reviewed: boolean, finalPositive: boolean, lowConfidence: boolean): ConfusionCell {
  if (reviewed) {
    if (omrPositive) return finalPositive ? "correctPositive" : "falsePositive";
    return finalPositive ? "falseNegative" : "correctNegative";
  }
  if (omrPositive) return lowConfidence ? "unreviewedPositiveLow" : "unreviewedPositiveHigh";
  return lowConfidence ? "unreviewedNegativeLow" : "unreviewedNegativeHigh";
}

/** Classifies every OMR-evaluated OPTION into the confusion matrix of `DetectionConfusionMatrix`, in its own pass grouped by option index. */
function buildConfusionMatrix(
  items: McDetectionItem[],
  exerciseById: Map<string, ExerciseRecord>
): DetectionConfusionMatrix {
  const counts = Object.fromEntries(CONFUSION_CELLS.map((cell) => [cell, 0])) as Record<ConfusionCell, number>;

  for (const it of items) {
    if (it.confidence === "failed" || !it.original) continue;
    const optionCount = exerciseById.get(it.exerciseId)?.options?.length ?? 0;
    const origSelected = new Set(it.original.selectedOptions);
    const origFlagged = new Set(it.original.flaggedOptions ?? []);
    const finalSelected = new Set(it.selectedOptions);

    for (let idx = 0; idx < optionCount; idx++) {
      counts[confusionCell(origSelected.has(idx), !!it.isReviewed, finalSelected.has(idx), origFlagged.has(idx))] += 1;
    }
  }

  const totalOptionsEvaluated = CONFUSION_CELLS.reduce((sum, cell) => sum + counts[cell], 0);
  const bucket = (cell: ConfusionCell): ConfusionBucket => ({
    count: counts[cell],
    percent: totalOptionsEvaluated === 0 ? 0 : Math.round((counts[cell] / totalOptionsEvaluated) * 1000) / 10,
  });

  return {
    totalOptionsEvaluated,
    correctPositive: bucket("correctPositive"),
    falsePositive: bucket("falsePositive"),
    correctNegative: bucket("correctNegative"),
    falseNegative: bucket("falseNegative"),
    unreviewedPositiveHigh: bucket("unreviewedPositiveHigh"),
    unreviewedPositiveLow: bucket("unreviewedPositiveLow"),
    unreviewedNegativeHigh: bucket("unreviewedNegativeHigh"),
    unreviewedNegativeLow: bucket("unreviewedNegativeLow"),
  };
}

function optionsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

/** Physically marked bubbles of one (submission, exercise) score: 1 for a failed alignment (region still needs a human), else distinct options selected or flagged uncertain (a faint mark may be flagged without being counted as selected). */
function detectionMarkedCount(
  confidence: McConfidence,
  selectedOptions: number[],
  flaggedOptions: number[]
): number {
  if (confidence === "failed") return 1;
  return new Set([...selectedOptions, ...flaggedOptions]).size;
}
