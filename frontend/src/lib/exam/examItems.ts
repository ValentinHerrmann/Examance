import type { ExerciseRecord } from '#lib/db/schema';
import type { McGroup } from '#lib/db/dbEncryption';
import type { ExamItemRef } from '#lib/grading/omrTemplatePrep';

/** The exam's item order with vanished refs dropped and new exercises/groups appended; the rendered and the stored order both come from here. */
export function computeExamItems(current: ExamItemRef[], exs: ExerciseRecord[], groups: McGroup[]): ExamItemRef[] {
    const validIds = new Set([...exs.map((e) => e.id), ...groups.map((g) => g.id)]);
    const currentItems = current.filter((item) => validIds.has(item.id));
    const currentItemIds = new Set(currentItems.map((item) => item.id));

    const missingExercises = exs
        .filter((e) => !groups.some((g) => g.memberIds.includes(e.id)) && !currentItemIds.has(e.id))
        .map((e) => ({ type: 'exercise' as const, id: e.id }));

    const missingGroups = groups
        .filter((g) => !currentItemIds.has(g.id))
        .map((g) => ({ type: 'mc_group' as const, id: g.id }));

    return [...currentItems, ...missingExercises, ...missingGroups];
}
