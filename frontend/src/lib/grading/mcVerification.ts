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
      });
    }
  }

  const perExerciseMap = new Map<string, McExerciseBreakdown>();
  let totalQuestions = 0;
  let highQuestions = 0;
  let ambiguousQuestions = 0;
  let failedQuestions = 0;
  let totalMarkedBoxes = 0;
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
  }

  return {
    totalQuestions,
    highQuestions,
    ambiguousQuestions,
    failedQuestions,
    totalMarkedBoxes,
    perExercise: Array.from(perExerciseMap.values()),
    items,
  };
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
