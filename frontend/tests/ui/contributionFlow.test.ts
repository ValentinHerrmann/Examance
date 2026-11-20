// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { ApiError } from '../../src/lib/api/client';
import type { ContributionSummary } from '../../src/lib/api/exerciseContributions';

const acceptContribution = vi.fn(async () => {});
const loadContribution = vi.fn(async (id: string) => ({ id, version: 1 }));
vi.mock('../../src/lib/api/exerciseContributions', () => ({
  acceptContribution: (...a: unknown[]) => acceptContribution(...(a as [])),
  loadContribution: (id: string) => loadContribution(id),
  rejectContribution: vi.fn(),
  submitContributions: vi.fn(),
  withdrawContribution: vi.fn(),
}));
vi.mock('../../src/lib/api/exerciseSharing', () => ({ loadResyncPreview: vi.fn() }));
vi.mock('../../src/lib/components/exercise-library/ContributeModal.svelte', async () => import('./stubs/PropsList.svelte'));
vi.mock('../../src/lib/components/exercise-library/ReviewContributionModal.svelte', async () => import('./stubs/PropsList.svelte'));

const { default: ContributionFlow } = await import('../../src/lib/components/exercise-library/ContributionFlow.svelte');

const probes = () => (globalThis as { __propsList?: Record<string, unknown>[] }).__propsList ?? [];
const review = () => probes().find((p) => 'onAccept' in p)!;
const settle = async () => {
  for (let i = 0; i < 5; i++) await tick();
};
const callbacks = () => ({ onNotice: vi.fn(), onError: vi.fn(), onAccepted: vi.fn(), onDecided: vi.fn(), onSubmitted: vi.fn() });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  (globalThis as { __propsList?: unknown[] }).__propsList = [];
});

describe('ContributionFlow', () => {
  it('accepts a proposal, closes the review and reloads proposals and library', async () => {
    const cb = callbacks();
    const { component } = render(ContributionFlow, cb);
    (component as unknown as { review: (c: ContributionSummary) => void }).review({ id: 'c1' } as ContributionSummary);
    await settle();
    expect(review().open).toBe(true);
    await (review().onAccept as (id: string, o: object) => Promise<void>)('c1', { asVariant: false });
    await settle();
    expect(cb.onAccepted).toHaveBeenCalledTimes(1);
    expect(cb.onNotice).toHaveBeenCalledTimes(1);
    expect(review().open).toBe(false);
  });

  it('keeps the review open with the reloaded proposal after a conflict', async () => {
    acceptContribution.mockRejectedValueOnce(new ApiError(409, 'ERR_CONFLICT', 'changed'));
    const cb = callbacks();
    const { component } = render(ContributionFlow, cb);
    (component as unknown as { review: (c: ContributionSummary) => void }).review({ id: 'c1' } as ContributionSummary);
    await settle();
    await (review().onAccept as (id: string, o: object) => Promise<void>)('c1', { asVariant: false });
    await settle();
    expect(cb.onAccepted).not.toHaveBeenCalled();
    expect(review().open).toBe(true);
    expect(review().keepEdits).toBe(true);
  });
});
