// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import McReviewProgress from '../../src/lib/components/verify/McReviewProgress.svelte';
import { translate } from '../../src/lib/i18n';
import type { McVerificationStats } from '../../src/lib/grading/mcVerification';

afterEach(cleanup);

const queue = (total: number, reviewed: number) => ({ total, reviewed }) as never;

const stats = {
  totalQuestions: 12,
  qualityStats: {
    totalReviewed: 2,
    failedConfidence: queue(0, 0),
    ambiguousConfidence: queue(0, 0),
    highConfidence: queue(12, 2),
  },
} as unknown as McVerificationStats;

describe('McReviewProgress', () => {
  // Regression: the bar labels rendered their i18n keys ("scanning.overview.progressFailedLabel") instead of the text.
  it('shows translated queue labels, never raw keys', async () => {
    const { container, getByText } = render(McReviewProgress, { stats });
    await tick();
    expect(container.textContent).not.toContain('scanning.overview.');
    for (const key of ['progressFailedLabel', 'progressUnsureLabel', 'progressHighLabel'] as const) {
      expect(getByText(translate(`scanning.overview.${key}`))).toBeTruthy();
    }
  });
});
