<script lang="ts">
  /** Percentage distribution — always all ten decile bins; gaps are the shape, not noise. */
  import { t } from '$lib/i18n';
  import { Card } from '$lib/components/ui';
  import { countAxis, type PercentageHistogramBin } from '$lib/analytics/stats';

  export let bins: PercentageHistogramBin[];

  const PLOT = 190;
  const GUTTER = 30;

  let width = 0;
  $: axis = countAxis(bins.map((b) => b.count), 5);
  $: slot = Math.max(120, width - GUTTER) / Math.max(1, bins.length);
  $: bar = Math.max(4, slot * 0.68);
  $: h = (count: number) => (count / axis.max) * PLOT;
</script>

<Card>
  <h3 class="text-base font-semibold text-content">{$t('stats.submissionHistogram.title')}</h3>

  <div class="mt-4 w-full min-w-0" bind:clientWidth={width}>
    {#if width > 0}
      <svg {width} height={PLOT + 34} viewBox="0 0 {width} {PLOT + 34}" role="img" aria-label={$t('stats.submissionHistogram.title')}>
        {#each axis.ticks as tick}
          <line x1={GUTTER} x2={width} y1={PLOT - h(tick)} y2={PLOT - h(tick)} stroke="var(--color-line)" />
          <text x="0" y={PLOT - h(tick) + 4} font-size="11" fill="var(--color-subtle)">{tick}</text>
        {/each}

        {#each bins as bin, i (bin.binStart)}
          {@const x = GUTTER + i * slot + (slot - bar) / 2}
          {@const confirmed = Math.max(h(bin.count - bin.provisionalCount), bin.count === 0 ? 2 : 0)}
          <rect
            {x}
            y={PLOT - confirmed}
            width={bar}
            height={confirmed}
            rx="3"
            fill={bin.count === 0 ? 'var(--color-line)' : 'var(--color-accent-strong)'}
          />
          {#if bin.provisionalCount > 0}
            <rect
              {x}
              y={PLOT - h(bin.count)}
              width={bar}
              height={h(bin.provisionalCount)}
              rx="3"
              fill="var(--color-accent)"
              opacity="0.45"
            />
          {/if}
          {#if bin.count > 0}
            <text x={x + bar / 2} y={PLOT - h(bin.count) - 5} text-anchor="middle" font-size="11" fill="var(--color-content)">
              {bin.count}
            </text>
          {/if}
          <text x={x + bar / 2} y={PLOT + 16} text-anchor="middle" font-size="10" fill="var(--color-subtle)">{bin.binStart}</text>
        {/each}

        <line x1={GUTTER} x2={width} y1={PLOT} y2={PLOT} stroke="var(--color-line-strong)" />
        <text x={width} y={PLOT + 30} text-anchor="end" font-size="10" fill="var(--color-subtle)">
          {$t('stats.submissionHistogram.axisLabel')}
        </text>
      </svg>
    {/if}
  </div>
</Card>
