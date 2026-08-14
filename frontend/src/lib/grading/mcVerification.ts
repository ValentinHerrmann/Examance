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
  high: number;
  ambiguous: number;
  failed: number;
  total: number;
}

export interface McVerificationStats {
  totalDetected: number;
  high: number;
  ambiguous: number;
  failed: number;
  perExercise: McExerciseBreakdown[];
  items: McDetectionItem[];
}

/**
 * `items` lists one entry per (submission, MC/SC/TF exercise) pair — that's the
 * granularity the verification *queues* work at, since a human reviews a whole
 * question (and its scan crop) at once. An exam with 30 students × 5 MC
 * questions produces up to 150 items here, not 30 (submissions) or 1 (exam).
 *
 * The numeric *counts* (`totalDetected`, `high`, `ambiguous`, `failed`, and the
 * per-exercise breakdown), however, are sums of `markedCount` — one physically
 * marked bubble on the scan — not one per item. A single MC question where a
 * student ticked 3 boxes is 3 detections, not 1; a question left entirely
 * blank is 0. Do not swap these back to `items.length`-based counts; that's
 * what "counted by question, not by marked box" describes and is the bug this
 * comment is here to prevent regressing.
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
    const scores = await loadScoresEncrypted(sub.id, key);
    const label = await labelFor(sub);
    for (const sc of scores) {
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
  let totalDetected = 0;
  let high = 0;
  let ambiguous = 0;
  let failed = 0;
  for (const it of items) {
    let b = perExerciseMap.get(it.exerciseId);
    if (!b) {
      b = { exerciseId: it.exerciseId, exerciseLabel: it.exerciseLabel, high: 0, ambiguous: 0, failed: 0, total: 0 };
      perExerciseMap.set(it.exerciseId, b);
    }
    b[it.confidence] += it.markedCount;
    b.total += it.markedCount;

    totalDetected += it.markedCount;
    if (it.confidence === "high") high += it.markedCount;
    else if (it.confidence === "ambiguous") ambiguous += it.markedCount;
    else failed += it.markedCount;
  }

  return {
    totalDetected,
    high,
    ambiguous,
    failed,
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
