<script lang="ts">
  /** Percentage distribution — always all twenty 5%-wide bins; gaps are the shape, not noise. */
  import { t } from '$lib/i18n';
  import { Card } from '$lib/components/ui';
  import { countAxis, type PercentageHistogramBin } from '$lib/analytics/stats';

  export let bins: PercentageHistogramBin[];

  // Padding keeps the top tick label, the count above the tallest bar and the
  // trailing "100" inside the drawing.
  const TOP = 14;
  const PLOT = 190;
  const GUTTER = 30;
  const RIGHT = 14;
  const BOTTOM = 34;
  const MIN_WIDTH = 280; // narrower containers scale the drawing down instead of clipping it

  let width = 0;
  $: vw = Math.max(width, MIN_WIDTH);
  $: axis = countAxis(bins.map((b) => b.count), 5);
  $: slot = (vw - GUTTER - RIGHT) / Math.max(1, bins.length);
  $: bar = Math.max(4, slot * 0.68);
  $: h = (count: number) => (count / axis.max) * PLOT;
  $: base = TOP + PLOT;
</script>

<Card>
  <h3 class="text-base font-semibold text-content">{$t('stats.submissionHistogram.title')}</h3>

  <div class="mt-4 w-full min-w-0" bind:clientWidth={width}>
    {#if width > 0}
      <svg
        {width}
        height={((base + BOTTOM) * width) / vw}
        viewBox="0 0 {vw} {base + BOTTOM}"
        role="img"
        aria-label={$t('stats.submissionHistogram.title')}
      >
        {#each axis.ticks as tick}
          <line x1={GUTTER} x2={vw - RIGHT} y1={base - h(tick)} y2={base - h(tick)} stroke="var(--color-line)" />
          <text x="0" y={base - h(tick) + 4} font-size="11" fill="var(--color-subtle)">{tick}</text>
        {/each}

        {#each bins as bin, i (bin.binStart)}
          {@const x = GUTTER + i * slot + (slot - bar) / 2}
          {@const confirmed = Math.max(h(bin.count - bin.provisionalCount), bin.count === 0 ? 3 : 0)}
          <!-- A zero count still draws a short foot in the bin's grade colour. -->
          <rect {x} y={base - confirmed} width={bar} height={confirmed} rx="3" fill={bin.colorVar} />
          {#if bin.provisionalCount > 0}
            <rect
              {x}
              y={base - h(bin.count)}
              width={bar}
              height={h(bin.provisionalCount)}
              rx="3"
              fill={bin.colorVar}
              opacity="0.45"
            />
          {/if}
          {#if bin.count > 0}
            <text x={x + bar / 2} y={base - h(bin.count) - 5} text-anchor="middle" font-size="11" fill="var(--color-content)">
              {bin.count}
            </text>
          {/if}
          <!-- Too many bins to label each one on a phone: label every 25%, plus 100 at the right edge. -->
          {#if bin.binStart % 25 === 0}
            <text x={GUTTER + i * slot} y={base + 16} text-anchor="middle" font-size="10" fill="var(--color-subtle)">{bin.binStart}</text>
          {/if}
        {/each}
        <text x={vw - RIGHT} y={base + 16} text-anchor="middle" font-size="10" fill="var(--color-subtle)">100</text>

        <line x1={GUTTER} x2={vw - RIGHT} y1={base} y2={base} stroke="var(--color-line-strong)" />
        <text x={vw} y={base + 31} text-anchor="end" font-size="10" fill="var(--color-subtle)">
          {$t('stats.submissionHistogram.axisLabel')}
        </text>
      </svg>
    {/if}
  </div>
</Card>
