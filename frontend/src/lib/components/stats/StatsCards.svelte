<script lang="ts">
  import { t, type TranslationKey } from '$lib/i18n';
  import { fmt } from '$lib/utils/format';
  import type { ExamStats } from '$lib/analytics/stats';
  import InfoTip from '$lib/components/help/InfoTip.svelte';
  import type { GradingKeyConfig } from '$lib/db/schema';
  import { gradeColorForPercentage, gradeColorVar } from '$lib/analytics/gradingKey';

  export let stats: ExamStats;
  export let totalMaxPoints: number | null;
  export let gradingKey: GradingKeyConfig | undefined = undefined;

  // Values that stand for a grade are tinted like the charts' bars. The darkest grades are
  // lifted towards white, or dark green / dark red text is hard to read on the dark tiles.
  const LIFT: Record<string, string> = {
    'var(--color-grade-1)': 'color-mix(in srgb, var(--color-grade-1) 60%, white)',
    'var(--color-grade-6)': 'color-mix(in srgb, var(--color-grade-6) 60%, white)',
  };
  const textColor = (token: string | null) => (token ? (LIFT[token] ?? token) : '');
  $: percentColor = (p: number | undefined) => textColor(p === undefined ? null : gradeColorForPercentage(p, gradingKey));
  $: gradeAverageColor = (() => {
    if (stats.gradeAverage === null) return '';
    const idx = stats.gradeBuckets.findIndex((b) => Number.parseFloat(b.grade) === Math.round(stats.gradeAverage ?? NaN));
    return idx < 0 ? '' : textColor(gradeColorVar(idx, stats.gradeBuckets.length));
  })();

  const DASH = '–';
  $: pct = (value: number | undefined) => (value === undefined ? DASH : $fmt.percent(value / 100, 1));
  $: num = (value: number | null, min: number, max = min) =>
    value === null ? DASH : $fmt.number(value, { minimumFractionDigits: min, maximumFractionDigits: max });

  $: plus = stats.borderline.filter((c) => c.side === '+').length;
  $: minus = stats.borderline.length - plus;
  $: cards = [
    ['stats.cards.gradeAverage', num(stats.gradeAverage, 2), '', 'stats.cards.info.gradeAverage', gradeAverageColor],
    ['stats.cards.passRate', stats.passRate === null ? DASH : $fmt.percent(stats.passRate, 0), '', 'stats.cards.info.passRate', ''],
    ['stats.cards.avgPoints', num(stats.meanPoints, 0, 1), totalMaxPoints === null ? '' : `/${num(totalMaxPoints, 0, 1)}`, 'stats.cards.info.avgPoints', percentColor(stats.summary?.mean)],
    ['stats.cards.avgPercent', pct(stats.summary?.mean), '', 'stats.cards.info.avgPercent', percentColor(stats.summary?.mean)],
    ['stats.cards.median', pct(stats.summary?.median), '', 'stats.cards.info.median', percentColor(stats.summary?.median)],
    ['stats.cards.stdDev', pct(stats.summary?.stdDev), '', 'stats.cards.info.stdDev', ''],
    ['stats.cards.borderline', `+${plus} / −${minus}`, '', 'stats.cards.info.borderline', ''],
  ] satisfies [TranslationKey, string, string, TranslationKey, string][];
</script>

<div class="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
  {#each cards as [label, value, suffix, info, color]}
    <div class="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-surface-raised px-4 py-3">
      <span class="flex items-start justify-between gap-1 text-xs uppercase tracking-wide text-subtle">
        <span class="min-w-0">{$t(label)}</span>
        <InfoTip class="-mt-0.5 -mr-1" text={$t(info)} topic="stats" />
      </span>
      <span class="text-xl font-semibold tabular-nums text-content" style={color ? `color: ${color}` : undefined}>
        {value}<span class="text-sm text-subtle">{suffix}</span>
      </span>
    </div>
  {/each}
</div>

<p class="mb-6 text-xs text-subtle">
  {$t('stats.cards.basis', { count: stats.results.length })}
</p>
