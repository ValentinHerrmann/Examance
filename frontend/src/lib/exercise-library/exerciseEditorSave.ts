/** The exercise editor's writes: `writeExercise` for a new exercise (explicit Save) and an edited one (autosave, issue #232), `writeNewVersion` for "Save as new version". */
import { get } from 'svelte/store';
import type { ExerciseRecord } from '#lib/db/schema';
import { saveExerciseEncrypted, loadExercisesEncrypted } from '#lib/db/dbEncryption';
import { api } from '#lib/api/client';
import { sessionStore, isAuthenticated } from '#lib/stores/session';
import { parseExerciseScore } from '#lib/latex/scoreParser';
import { parseMcOptions, MC_MIN_OPTIONS, type McOption } from '#lib/latex/mcOptions';
import { setCompetencies, setRequirementLevel } from '#lib/latex/exerciseStructure';
import type { TranslationKey } from '#lib/i18n';

/** Typing LaTeX is bursty and each save encrypts and PATCHes the record: wait longer than the form default. */
export const EDITOR_AUTOSAVE_MS = 2000;

export interface ExerciseDraft {
  name: string;
  topicTag: string;
  grade: string;
  subject: string;
  variantKey: string;
  latexBody: string;
  questionType: 'free_text' | 'mc';
  penalty: number;
}

/** MC LaTeX without the AFB/competency tags, which travel separately. */
export function withoutMetaTags(latex: string): string {
  return setCompetencies(setRequirementLevel(latex, null), []);
}

/** The options as printed: the LaTeX is what gets saved, so the answer key is read from it. */
export function mcOptionsOf(latex: string): McOption[] {
  return parseMcOptions(withoutMetaTags(latex)).options;
}

export function mcAnswerKey(draft: ExerciseDraft): { options: string[]; correct: number[] } | null {
  if (draft.questionType !== 'mc') return null;
  const opts = mcOptionsOf(draft.latexBody);
  return { options: opts.map((o) => o.text), correct: opts.flatMap((o, i) => (o.correct ? [i] : [])) };
}

/** The i18n key of why *draft* cannot be saved, or null. */
export function exerciseDraftError(draft: ExerciseDraft): TranslationKey | null {
  if (!draft.name.trim()) return 'exercises.editor.nameRequired';
  if (draft.questionType === 'mc') {
    const opts = mcOptionsOf(draft.latexBody);
    if (opts.length < MC_MIN_OPTIONS) return 'exercises.editor.mcMinOptions';
    if (!opts.some((o) => o.correct)) return 'exercises.editor.mcCorrectRequired';
  }
  return null;
}

/** Writes *draft* onto *base* (or a new exercise when null) and returns the stored record. */
export async function writeExercise(
  base: ExerciseRecord | null,
  draft: ExerciseDraft,
  { key }: { key: CryptoKey | null }
): Promise<ExerciseRecord> {
  const answers = mcAnswerKey(draft);
  const isMc = answers !== null;
  const record: ExerciseRecord = {
    id: base?.id || crypto.randomUUID(),
    teacherId: base?.teacherId || get(sessionStore).email || 'local-teacher',
    name: draft.name,
    topicTag: draft.topicTag,
    grade: draft.grade.trim() || undefined,
    subject: draft.subject.trim() || undefined,
    latexBody: draft.latexBody,
    maxPoints: parseExerciseScore(draft.latexBody),
    version: base ? base.version : 1,
    questionType: draft.questionType,
    options: answers?.options,
    correctAnswers: answers?.correct,
    penalty: isMc ? draft.penalty : base?.penalty || 0,
    exerciseGroupId: base?.exerciseGroupId,
    variantKey: draft.variantKey.trim() || undefined,
    isCurrent: base?.isCurrent ?? true,
    updatedAt: new Date().toISOString(),
  };

  await saveExerciseEncrypted(record, key);

  // saveExerciseEncrypted() already created a new exercise on the server; a second POST is a 409 (create-only). The PATCH sends explicit nulls so cleared fields stick.
  if (get(isAuthenticated) && base) {
    try {
      await api.patch(`/exercises/${record.id}`, {
        name: record.name,
        topic_tag: record.topicTag,
        grade: record.grade || null,
        subject: record.subject || null,
        latex_body: record.latexBody,
        variant_key: record.variantKey || null,
        question_type: record.questionType || 'free_text',
        correct_answers: answers,
        penalty: record.penalty || 0,
      }, { silentError: true }); // the repository save already queued the write when offline
    } catch (apiErr) {
      console.warn('Failed to sync exercise to server:', apiErr);
    }
  }
  return record;
}

/** Copies name, topic, grade and subject of *record* onto its group's sister exercises. */
export async function cascadeGroupMetadata(record: ExerciseRecord, key: CryptoKey | null): Promise<void> {
  if (!record.exerciseGroupId) return;
  const allLocal = await loadExercisesEncrypted(key);
  for (const sister of allLocal) {
    if (sister.exerciseGroupId === record.exerciseGroupId && sister.id !== record.id) {
      await saveExerciseEncrypted(
        { ...sister, name: record.name, topicTag: record.topicTag, grade: record.grade, subject: record.subject, updatedAt: new Date().toISOString() },
        key
      );
    }
  }
}

/** Stores *draft* as the next version of *base*: a new exercise row in base's group, with base marked not current. */
export async function writeNewVersion(base: ExerciseRecord, draft: ExerciseDraft, key: CryptoKey | null): Promise<ExerciseRecord> {
  const answers = mcAnswerKey(draft);
  const grade = draft.grade.trim() || undefined;
  const subject = draft.subject.trim() || undefined;
  const variantKey = draft.variantKey.trim() || undefined;
  const nextVersion = (base.version || 1) + 1;
  if (get(isAuthenticated)) {
    const res = (await api.post(`/exercises/${base.id}/new-version`, {
      name: draft.name,
      topic_tag: draft.topicTag,
      grade: grade ?? null,
      subject: subject ?? null,
      latex_body: draft.latexBody,
      question_type: draft.questionType,
      correct_answers: answers,
    })) as any;
    const saved: ExerciseRecord = {
      id: res.id || crypto.randomUUID(),
      teacherId: res.teacher_id || get(sessionStore).email || 'local-teacher',
      name: res.name || draft.name,
      topicTag: res.topic_tag || draft.topicTag,
      grade: res.grade || grade,
      subject: res.subject || subject,
      latexBody: res.latex_body || draft.latexBody,
      maxPoints: res.max_points || parseExerciseScore(draft.latexBody),
      version: res.version || nextVersion,
      questionType: res.question_type || draft.questionType,
      options: answers?.options,
      correctAnswers: answers?.correct,
      penalty: res.penalty ?? draft.penalty,
      exerciseGroupId: res.exercise_group_id || base.exerciseGroupId,
      variantKey: res.variant_key || variantKey,
      isCurrent: res.is_current ?? true,
      updatedAt: new Date().toISOString(),
    };
    await saveExerciseEncrypted(saved, key);
    return saved;
  }
  const groupId = base.exerciseGroupId || crypto.randomUUID();
  if (!base.exerciseGroupId) {
    base.exerciseGroupId = groupId;
    await saveExerciseEncrypted(base, key);
  }
  const saved: ExerciseRecord = {
    ...base,
    id: crypto.randomUUID(),
    name: draft.name,
    topicTag: draft.topicTag,
    grade,
    subject,
    latexBody: draft.latexBody,
    maxPoints: parseExerciseScore(draft.latexBody),
    version: nextVersion,
    questionType: draft.questionType,
    options: answers?.options,
    correctAnswers: answers?.correct,
    penalty: draft.penalty,
    exerciseGroupId: groupId,
    variantKey,
    isCurrent: true,
    updatedAt: new Date().toISOString(),
  };
  await saveExerciseEncrypted({ ...base, isCurrent: false }, key);
  await saveExerciseEncrypted(saved, key);
  return saved;
}
