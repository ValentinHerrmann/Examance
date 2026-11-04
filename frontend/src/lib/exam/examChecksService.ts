import { get } from 'svelte/store';
import { examRepository } from '#lib/repositories/examRepository';
import { examChecksState } from '#lib/stores/shell';
import type { StepChecks } from './examChecks';

/** Saves the hand-set ticks and shows them in the sidebar at once, without waiting for a navigation. */
export async function saveExamChecks(examId: string, checks: StepChecks): Promise<void> {
    await examRepository.saveStepChecks(examId, checks);
    const state = get(examChecksState);
    if (state?.examId === examId) examChecksState.set({ ...state, checks });
}
