// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { translate } from '../../src/lib/i18n';
import type { ExerciseRecord } from '../../src/lib/db/schema';

const loadExamUsage = vi.fn();
const remove = vi.fn(async (_id: string) => {});
vi.mock('../../src/lib/exercise-library/examUsage', () => ({ loadExamUsage: (ids: string[]) => loadExamUsage(ids) }));
vi.mock('../../src/lib/repositories/exerciseRepository', () => ({ exerciseRepository: { delete: (id: string) => remove(id) } }));

const { default: ExerciseDeleteFlow } = await import('../../src/lib/components/exercise-library/ExerciseDeleteFlow.svelte');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const settle = async () => {
  for (let i = 0; i < 5; i++) await tick();
};
const exercise = { id: 'ex1', name: 'Bruchrechnen' } as ExerciseRecord;
const confirmButton = () => screen.getByRole('button', { name: translate('common.deleteModal.deleteAnyway') }) as HTMLButtonElement;

describe('ExerciseDeleteFlow', () => {
  it('lists the exams using the exercise and deletes on confirm', async () => {
    loadExamUsage.mockResolvedValueOnce([{ id: 'e1', title: 'Schulaufgabe 1' }]);
    const onSaved = vi.fn();
    const { component } = render(ExerciseDeleteFlow, { onSaved });
    await (component as unknown as { open: (ex: ExerciseRecord) => Promise<void> }).open(exercise);
    await settle();
    expect(screen.getByText('Schulaufgabe 1')).toBeTruthy();
    await fireEvent.click(confirmButton());
    await settle();
    expect(remove).toHaveBeenCalledWith('ex1');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('blocks the delete when the usage could not be checked (issue #298)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    loadExamUsage.mockRejectedValueOnce(new Error('offline'));
    const { component } = render(ExerciseDeleteFlow, { onSaved: vi.fn() });
    await (component as unknown as { open: (ex: ExerciseRecord) => Promise<void> }).open(exercise);
    await settle();
    expect(screen.getByText(translate('exercises.deleteModal.usageFailed'))).toBeTruthy();
    expect(confirmButton().disabled).toBe(true);
  });
  it('shows only the usage of the exercise opened last', async () => {
    let releaseFirst!: (v: unknown) => void;
    loadExamUsage.mockImplementationOnce(() => new Promise((r) => (releaseFirst = r)));
    loadExamUsage.mockResolvedValueOnce([]);
    const { component } = render(ExerciseDeleteFlow, { onSaved: vi.fn() });
    const flow = component as unknown as { open: (ex: ExerciseRecord) => Promise<void> };
    const first = flow.open({ id: 'exA', name: 'A' } as ExerciseRecord);
    await flow.open({ id: 'exB', name: 'B' } as ExerciseRecord);
    releaseFirst([{ id: 'e1', title: 'Schulaufgabe von A' }]);
    await first;
    await settle();
    expect(screen.queryByText('Schulaufgabe von A')).toBeNull();
    expect(confirmButton().disabled).toBe(false);
  });
});
