<script lang="ts">
  /**
   * The headline numbers.
   *
   * Grades and points were missing entirely: the four cards were count, Ø %, σ %
   * and median %, which is not what a teacher is asked for. The class average
   * grade (Notendurchschnitt) and the pass rate are the two numbers that go on
   * the board, and points-out-of-max is what makes a percentage mean something.
   */
  import { t } from '$lib/i18n';
  import { fmt } from '$lib/utils/format';

  export let submissionsWithAnyGrade: number;
  export let meanPercentage: number;
  export let stdDevPercentage: number;
  export let medianPercentage: number;
  export let classGradeAverage: number | null = null;
  export let passRate: number | null = null;
  export let meanPoints: number | null = null;
  export let totalMaxPoints: number | null = null;

  const card =
    'flex flex-col gap-1 rounded-xl border border-line bg-surface-raised px-4 py-3 min-w-0';
  const label = 'text-xs uppercase tracking-wide text-subtle';
  const value = 'text-xl font-semibold text-content tabular-nums';
</script>

<div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
  <div class={card}>
    <span class={label}>{$t('stats.cards.gradeAverage')}</span>
    <span class={value}>
      {classGradeAverage === null
        ? '–'
        : $fmt.number(classGradeAverage, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  </div>
  <div class={card}>
    <span class={label}>{$t('stats.cards.passRate')}</span>
    <span class={value}>{passRate === null ? '–' : $fmt.percent(passRate, 0)}</span>
  </div>
  <div class={card}>
    <span class={label}>{$t('stats.cards.avgPoints')}</span>
    <span class={value}>
      {#if meanPoints === null || totalMaxPoints === null}
        –
      {:else}
        {$fmt.number(meanPoints, { maximumFractionDigits: 1 })}<span class="text-sm text-subtle"
          >/{$fmt.number(totalMaxPoints, { maximumFractionDigits: 1 })}</span
        >
      {/if}
    </span>
  </div>
  <div class={card}>
    <span class={label}>{$t('stats.cards.avgPercent')}</span>
    <span class={value}>{$fmt.percent(meanPercentage / 100, 1)}</span>
  </div>
  <div class={card}>
    <span class={label}>{$t('stats.cards.median')}</span>
    <span class={value}>{$fmt.percent(medianPercentage / 100, 1)}</span>
  </div>
  <div class={card}>
    <span class={label}>{$t('stats.cards.stdDev')}</span>
    <span class={value}>{$fmt.percent(stdDevPercentage / 100, 1)}</span>
  </div>
</div>

<p class="mb-6 text-xs text-subtle">
  {$t('stats.cards.basis', { count: submissionsWithAnyGrade })}
</p>
