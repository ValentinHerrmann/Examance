/** Bulk changes to MC review marks (issue #212): confirm every sure detection at once, and put detections back to unreviewed (all, or one bulk run). */
import type { ExerciseScoreRecord } from '#lib/db/schema';
import { scoreRepository } from '#lib/repositories/scoreRepository';
import { loadExamMcExercises } from './mcExerciseHash';
import { confirmDetection, restoreOriginalDetection, type McQuestionType } from './mcScore';
import { isMcReviewed } from './mcVerification';

/** One read for the whole exam, one write per touched submission. */
async function rewriteScores(
    examId: string,
    key: CryptoKey | null,
    change: (sc: ExerciseScoreRecord) => ExerciseScoreRecord | null,
): Promise<number> {
    const bySubmission = new Map<string, ExerciseScoreRecord[]>();
    for (const sc of await scoreRepository.getByExamId(examId, key)) {
        const next = change(sc);
        if (next) bySubmission.set(sc.submissionId, [...(bySubmission.get(sc.submissionId) ?? []), next]);
    }
    let count = 0;
    for (const [submissionId, scores] of bySubmission) {
        await scoreRepository.saveMany(examId, submissionId, scores, key); // NOSONAR: one write per submission in order, as the reset of all reviews does; parallel writes would flood the API for a large class
        count += scores.length;
    }
    return count;
}

/** Marks the given unreviewed detections as reviewed without changing them; every row gets the same `reviewedAt`, which an undo looks for. */
export async function confirmDetections(
    examId: string,
    key: CryptoKey | null,
    items: readonly { submissionId: string; exerciseId: string }[],
): Promise<{ at: string; count: number }> {
    const wanted = new Set(items.map((i) => `${i.submissionId}:${i.exerciseId}`));
    const at = new Date().toISOString();
    const count = await rewriteScores(examId, key, (sc) => {
        if (!sc.omrMeta || isMcReviewed(sc.omrMeta) || !wanted.has(`${sc.submissionId}:${sc.exerciseId}`)) return null;
        const res = confirmDetection(sc.selectedOptions ?? [], sc.score ?? 0, sc.omrMeta);
        return { ...sc, selectedOptions: res.nextSelectedOptions, score: res.nextScore, omrMeta: { ...res.nextOmrMeta, reviewedAt: at } };
    });
    return { at, count };
}

/** Puts detections back to what the scanner read, unreviewed; `onlyReviewedAt` limits it to one bulk run, so reviews made by hand since stay. */
export async function restoreDetections(examId: string, key: CryptoKey | null, onlyReviewedAt?: string): Promise<number> {
    const exerciseById = new Map((await loadExamMcExercises(examId, key)).map((e) => [e.id, e]));
    return rewriteScores(examId, key, (sc) => {
        const ex = exerciseById.get(sc.exerciseId);
        if (!ex || !sc.omrMeta?.original) return null;
        if (onlyReviewedAt !== undefined && sc.omrMeta.reviewedAt !== onlyReviewedAt) return null;
        const res = restoreOriginalDetection(
            (ex.questionType as McQuestionType) || 'mc',
            ex.correctAnswers ?? [],
            ex.penalty ?? 0,
            ex.maxPoints,
            sc.omrMeta,
        );
        return res ? { ...sc, selectedOptions: res.nextSelectedOptions, score: res.nextScore, omrMeta: res.nextOmrMeta } : null;
    });
}
