// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { ExerciseGroup } from '../../src/lib/exercise-library/groupExercises';

const setExerciseSharing = vi.fn(async () => {});
const copySharedExercise = vi.fn(async () => {});
vi.mock('../../src/lib/api/exerciseSharing', () => ({
  setExerciseSharing: (...a: unknown[]) => setExerciseSharing(...(a as [])),
  copySharedExercise: (...a: unknown[]) => copySharedExercise(...(a as [])),
  applyResync: vi.fn(),
  bulkSetSharing: vi.fn(),
  loadResyncPreview: vi.fn(),
  setSharingPaused: vi.fn(),
  unlinkSource: vi.fn(),
}));
vi.mock('../../src/lib/components/exercise-library/ShareExerciseModal.svelte', async () => import('./stubs/PropsList.svelte'));
vi.mock('../../src/lib/components/exercise-library/ResyncModal.svelte', async () => import('./stubs/PropsList.svelte'));

const { default: SharingFlow } = await import('../../src/lib/components/exercise-library/SharingFlow.svelte');

const probes = () => (globalThis as { __propsList?: Record<string, unknown>[] }).__propsList ?? [];
const settle = async () => {
  for (let i = 0; i < 5; i++) await tick();
};
const group = { groupId: 'g1', name: 'Brüche', allMembers: [{ ex: { id: 'ex1', isCurrent: true } }], variants: new Map() } as unknown as ExerciseGroup;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  (globalThis as { __propsList?: unknown[] }).__propsList = [];
});

describe('SharingFlow', () => {
  it('shares a group after the confirm and reloads the library', async () => {
    const onSaved = vi.fn();
    const { component } = render(SharingFlow, { onNotice: vi.fn(), onError: vi.fn(), onSaved });
    (component as unknown as { share: (g: ExerciseGroup) => void }).share(group);
    await settle();
    const dialog = probes().find((p) => p.open === true && p.name === 'Brüche')!;
    await (dialog.onConfirm as () => Promise<void>)();
    await settle();
    expect(setExerciseSharing).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('copies a shared group with a notice', async () => {
    const onNotice = vi.fn();
    const onSaved = vi.fn();
    const { component } = render(SharingFlow, { onNotice, onError: vi.fn(), onSaved });
    await (component as unknown as { copy: (g: ExerciseGroup) => Promise<void> }).copy(group);
    expect(copySharedExercise).toHaveBeenCalledTimes(1);
    expect(onNotice).toHaveBeenLastCalledWith(expect.stringContaining('Brüche'));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('reports a failed copy on the page', async () => {
    copySharedExercise.mockRejectedValueOnce(new Error('nope'));
    const onError = vi.fn();
    const { component } = render(SharingFlow, { onNotice: vi.fn(), onError, onSaved: vi.fn() });
    await (component as unknown as { copy: (g: ExerciseGroup) => Promise<void> }).copy(group);
    expect(onError).toHaveBeenLastCalledWith(expect.any(String));
    expect((onError.mock.calls.at(-1) as string[])[0]).not.toBe('');
  });
});
