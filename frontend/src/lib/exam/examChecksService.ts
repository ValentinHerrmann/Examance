import { get } from 'svelte/store';
import { examRepository } from '#lib/repositories/examRepository';
import { examChecksState } from '#lib/stores/shell';
import type { StepChecks } from './examChecks';

const queues = new Map<string, Promise<void>>();
const lastSaved = new Map<string, StepChecks>();

/** The newest checks known for the exam: the sidebar's state when it shows this exam, else the last one saved here. */
function latestChecks(examId: string, base: StepChecks): StepChecks {
  const state = get(examChecksState);
  if (state?.examId === examId) return state.checks;
  return lastSaved.get(examId) ?? base;
}

/** Saves the hand-set ticks and shows them in the sidebar at once. Saves of one exam run one after another, and each builds `update` from the checks the previous one stored, so two quick ticks never overwrite each other (issue #298); `base` is used only when nothing newer is known. */
export function saveExamChecks(examId: string, base: StepChecks, update: (checks: StepChecks) => StepChecks): Promise<void> {
  const previous = queues.get(examId) ?? Promise.resolve();
  const step = previous.then(async () => {
    const checks = update(latestChecks(examId, base));
    await examRepository.saveStepChecks(examId, checks);
    lastSaved.set(examId, checks);
    const state = get(examChecksState);
    if (state?.examId === examId) examChecksState.set({ ...state, checks });
  });
  // A failed save must not block the next one; the caller still sees its own error.
  const settled = step.catch(() => undefined);
  queues.set(examId, settled);
  void settled.then(() => {
    if (queues.get(examId) === settled) queues.delete(examId);
  });
  return step;
}
