import { api } from '#lib/api/client';
import { db } from '#lib/db/db';
import { decryptExercise } from '#lib/db/dbEncryption';
import { enqueueOrThrow } from '#lib/services/offlineQueue';
import type { ExerciseRecord } from '#lib/db/schema';
import { normalizeMcExercise, serializeMcAnswers } from '#lib/grading/mcExerciseHash';
import { invalidateOwner } from '#lib/latex/compileCache';

/**
 * The one API -> ExerciseRecord mapper; use it for every exercise payload. Hand-rolled copies dropped
 * variantKey/exerciseGroupId/isCurrent, making variants indistinguishable and overwriting the full IndexedDB record.
 */
export function mapApiToExerciseRecord(raw: any): ExerciseRecord {
  const baseRecord: ExerciseRecord = {
    id: raw.id,
    teacherId: raw.teacher_id || raw.teacherId,
    examId: raw.exam_id || raw.examId,
    orderIndex: raw.order_index ?? raw.orderIndex ?? 0,
    subIndex: raw.sub_index ?? raw.subIndex,
    mcGroupId: raw.mc_group_id || raw.mcGroupId,
    title: raw.name || raw.title || 'Exercise',
    name: raw.name || raw.title,
    latexBody: raw.latex_body || raw.latexBody || '',
    codeWithheld: raw.code_withheld ?? raw.codeWithheld ?? undefined,
    maxPoints: raw.max_points ?? raw.maxPoints ?? 0,
    topicTag: raw.topic_tag || raw.topicTag,
    grade: raw.grade,
    subject: raw.subject,
    version: raw.version || 1,
    exerciseGroupId: raw.exercise_group_id || raw.exerciseGroupId,
    variantKey: raw.variant_key || raw.variantKey,
    isCurrent: raw.is_current ?? raw.isCurrent ?? true,
    createdAt: raw.created_at || raw.createdAt,
    updatedAt: raw.updated_at || raw.updatedAt,
    questionType: raw.question_type || raw.questionType || 'free_text',
    options: raw.options || [],
    correctAnswers: raw.correct_answers || raw.correctAnswers || [],
    penalty: raw.penalty || 0,
    isShared: raw.is_shared ?? raw.isShared ?? false,
    groupCopied: raw.group_copied ?? raw.groupCopied ?? false,
  };

  return normalizeMcExercise(baseRecord);
}

export function mapExerciseRecordToApi(ex: ExerciseRecord): any {
  return {
    id: ex.id,
    name: ex.title || ex.name || 'Exercise',
    // Withheld code stays withheld (null body); the server then keeps max_points as sent.
    latex_body: ex.codeWithheld ? null : ex.latexBody || '',
    code_withheld: ex.codeWithheld ?? false,
    max_points: ex.maxPoints,
    topic_tag: ex.topicTag,
    grade: ex.grade,
    subject: ex.subject,
    question_type: ex.questionType || 'free_text',
    // The backend stores the answer key as a JSON object; sending the raw
    // `correctAnswers` array is rejected with a 422. `options` is not a field on
    // ExerciseCreate at all — it travels inside correct_answers.
    correct_answers: serializeMcAnswers(ex),
    penalty: ex.penalty || 0,
    exercise_group_id: ex.exerciseGroupId,
    variant_key: ex.variantKey,
  };
}

export const exerciseRepository = {
  async getAll(_key: CryptoKey | null): Promise<ExerciseRecord[]> {
    try {
      // silentError: the caller falls back to the local copy on failure.
      const rawList = await api.get<any[]>('/exercises', { silentError: true });
      return rawList.map(mapApiToExerciseRecord);
    } catch (err: any) {
      return [];
    }
  },

  async getByExamId(examId: string, key: CryptoKey | null): Promise<ExerciseRecord[]> {
    try {
      const rawList = await api.get<any[]>(`/exams/${examId}/exercises`, { silentError: true });
      const mapped = rawList.map(mapApiToExerciseRecord);
      mapped.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0) || (a.subIndex || 0) - (b.subIndex || 0));
      return mapped;
    } catch (err: any) {
      const links = await db.examExercises.where('examId').equals(examId).toArray();
      links.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0) || (a.subIndex || 0) - (b.subIndex || 0));
      if (links.length > 0) {
        const exercises: ExerciseRecord[] = [];
        for (const link of links) {
          const rawEx = await db.exercises.get(link.exerciseId);
          if (rawEx) {
            const ex = await decryptExercise(rawEx, key);
            exercises.push({ ...ex, orderIndex: link.orderIndex, subIndex: link.subIndex, mcGroupId: link.mcGroupId });
          }
        }
        return exercises;
      }
      const raw = await db.exercises.where('examId').equals(examId).toArray();
      if (raw.length > 0) {
        return Promise.all(raw.map((ex) => decryptExercise(ex, key)));
      }
      return [];
    }
  },

  async save(ex: ExerciseRecord, _key: CryptoKey | null): Promise<void> {
    const payload = mapExerciseRecordToApi(ex);
    try {
      await api.post('/exercises', payload, { silentError: true });
    } catch (err: any) {
      // POST /exercises is create-only and answers 409 for an id it already
      // knows. Re-queuing that POST could never succeed — it just replayed the
      // same conflict on every flush. An existing exercise is a PATCH.
      if (err?.status === 409) {
        const { id: _id, ...patchPayload } = payload;
        try {
          await api.patch(`/exercises/${ex.id}`, patchPayload, { silentError: true });
        } catch (patchErr) {
          enqueueOrThrow(patchErr, `/exercises/${ex.id}`, 'PATCH', patchPayload);
        }
      } else {
        enqueueOrThrow(err, '/exercises', 'POST', payload);
      }
    }
  },

  async delete(id: string): Promise<void> {
    invalidateOwner('exercise', id);
    try {
      await api.delete(`/exercises/${id}`, { silentError: true });
    } catch (err: any) {
      enqueueOrThrow(err, `/exercises/${id}`, 'DELETE');
    } finally {
      // The server cascades its own rows; drop the local mirror either way, or
      // an IndexedDB fallback would bring the exercise back.
      await db.exercises.delete(id);
      await db.exerciseResources.where('exerciseId').equals(id).delete();
    }
  },
};
