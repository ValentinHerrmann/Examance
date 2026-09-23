<script lang="ts">
  import { t, type TranslationKey } from '$lib/i18n';
  import { fmt } from '$lib/utils/format';
  import type { ExamStats } from '$lib/analytics/stats';

  export let stats: ExamStats;
  export let totalMaxPoints: number | null;

  const DASH = '–';
  $: pct = (value: number | undefined) => (value === undefined ? DASH : $fmt.percent(value / 100, 1));
  $: num = (value: number | null, min: number, max = min) =>
    value === null ? DASH : $fmt.number(value, { minimumFractionDigits: min, maximumFractionDigits: max });

  $: cards = [
    ['stats.cards.gradeAverage', num(stats.gradeAverage, 2), ''],
    ['stats.cards.passRate', stats.passRate === null ? DASH : $fmt.percent(stats.passRate, 0), ''],
    ['stats.cards.avgPoints', num(stats.meanPoints, 0, 1), totalMaxPoints === null ? '' : `/${num(totalMaxPoints, 0, 1)}`],
    ['stats.cards.avgPercent', pct(stats.summary?.mean), ''],
    ['stats.cards.median', pct(stats.summary?.median), ''],
    ['stats.cards.stdDev', pct(stats.summary?.stdDev), ''],
  ] satisfies [TranslationKey, string, string][];
</script>

<div class="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
  {#each cards as [label, value, suffix]}
    <div class="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-surface-raised px-4 py-3">
      <span class="text-xs uppercase tracking-wide text-subtle">{$t(label)}</span>
      <span class="text-xl font-semibold tabular-nums text-content">
        {value}<span class="text-sm text-subtle">{suffix}</span>
      </span>
    </div>
  {/each}
</div>

<p class="mb-6 text-xs text-subtle">
  {$t('stats.cards.basis', { count: stats.results.length })}
</p>
