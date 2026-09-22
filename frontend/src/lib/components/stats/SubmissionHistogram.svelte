<script lang="ts">
  /**
   * Percentage distribution — always all ten decile bins.
   *
   * The previous version dropped empty bins, so 0–10 %, 50–60 % and 90–100 %
   * rendered as three adjacent equal-width bars: a bimodal class read as a
   * uniform one. It also hid the whole chart body when nothing was graded while
   * leaving the heading behind, and sized itself from `window` rather than its
   * container.
   */
  import { t } from '$lib/i18n';
  import type { PercentageHistogramBin } from '$lib/analytics/stats';

  export let bins: PercentageHistogramBin[];

  let chartWidth = 0;

  const PLOT_HEIGHT = 190;
  const AXIS_HEIGHT = 34;
  const LEFT_GUTTER = 30;

  $: total = bins.reduce((sum, b) => sum + b.count, 0);

  /** Integer ticks with headroom — counts are whole students. */
  $: axisMax = Math.max(1, ...bins.map((b) => b.count)) + 1;
  $: tickStep = Math.max(1, Math.ceil(axisMax / 5));
  $: ticks = Array.from({ length: Math.floor(axisMax / tickStep) + 1 }, (_, i) => i * tickStep);

  $: plotWidth = Math.max(120, chartWidth - LEFT_GUTTER);
  $: slotWidth = bins.length > 0 ? plotWidth / bins.length : 0;
  $: barWidth = Math.max(4, slotWidth * 0.68);
  $: chartHeight = PLOT_HEIGHT + AXIS_HEIGHT;

  const barHeight = (count: number, max: number) => (max === 0 ? 0 : (count / max) * PLOT_HEIGHT);

  let hoveredBin: number | null = null;
</script>

<section class="rounded-xl border border-line bg-surface-raised p-4 sm:p-6">
  <h3 class="text-base font-semibold text-content">{$t('stats.submissionHistogram.title')}</h3>

  <div class="mt-4 w-full min-w-0" bind:clientWidth={chartWidth}>
    {#if chartWidth > 0}
      <svg
        width={chartWidth}
        height={chartHeight}
        viewBox="0 0 {chartWidth} {chartHeight}"
        role="img"
        aria-label={$t('stats.submissionHistogram.title')}
      >
        {#each ticks as tick}
          {@const y = PLOT_HEIGHT - barHeight(tick, axisMax)}
          <line
            x1={LEFT_GUTTER}
            y1={y}
            x2={chartWidth}
            y2={y}
            stroke="var(--color-line)"
            stroke-width="1"
          />
          <text x="0" y={y + 4} font-size="11" fill="var(--color-subtle)">{tick}</text>
        {/each}

        {#each bins as bin, i (bin.binStart)}
          {@const x = LEFT_GUTTER + i * slotWidth + (slotWidth - barWidth) / 2}
          {@const confirmed = bin.count - bin.provisionalCount}
          {@const confirmedH = barHeight(confirmed, axisMax)}
          {@const provisionalH = barHeight(bin.provisionalCount, axisMax)}
          <g
            on:mouseenter={() => (hoveredBin = i)}
            on:mouseleave={() => (hoveredBin = null)}
            role="presentation"
          >
            <!-- An empty bin keeps its slot and gets a baseline tick: the gaps
                 are the shape of the distribution, not noise to compress out. -->
            <rect
              x={x}
              y={PLOT_HEIGHT - Math.max(confirmedH, bin.count === 0 ? 2 : 0)}
              width={barWidth}
              height={Math.max(confirmedH, bin.count === 0 ? 2 : 0)}
              rx="3"
              fill={bin.count === 0 ? 'var(--color-line)' : 'var(--color-accent-strong)'}
            />
            {#if bin.provisionalCount > 0}
              <rect
                x={x}
                y={PLOT_HEIGHT - confirmedH - provisionalH}
                width={barWidth}
                height={provisionalH}
                rx="3"
                fill="var(--color-accent)"
                opacity="0.45"
              />
            {/if}

            {#if bin.count > 0 || hoveredBin === i}
              <text
                x={x + barWidth / 2}
                y={PLOT_HEIGHT - confirmedH - provisionalH - 5}
                text-anchor="middle"
                font-size="11"
                fill="var(--color-content)"
              >
                {bin.count}
              </text>
            {/if}

            <text
              x={x + barWidth / 2}
              y={PLOT_HEIGHT + 16}
              text-anchor="middle"
              font-size="10"
              fill={hoveredBin === i ? 'var(--color-content)' : 'var(--color-subtle)'}
            >
              {bin.binStart}
            </text>
          </g>
        {/each}

        <line
          x1={LEFT_GUTTER}
          y1={PLOT_HEIGHT}
          x2={chartWidth}
          y2={PLOT_HEIGHT}
          stroke="var(--color-line-strong)"
          stroke-width="1"
        />
        <text
          x={chartWidth}
          y={PLOT_HEIGHT + 30}
          text-anchor="end"
          font-size="10"
          fill="var(--color-subtle)"
        >
          {$t('stats.submissionHistogram.axisLabel')}
        </text>
      </svg>
    {/if}
  </div>

  {#if total === 0}
    <p class="mt-2 text-xs text-subtle">{$t('stats.submissionHistogram.empty')}</p>
  {/if}
</section>
