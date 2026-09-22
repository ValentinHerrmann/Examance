<script lang="ts">
  /**
   * Grade distribution — always the full 1–6 scale.
   *
   * The previous version filtered out every bucket with a count of zero, so the
   * axis showed "whichever grades happened to occur" rather than the scale, and
   * a class where nobody failed looked identical to one where nobody was
   * graded. It also sized itself from `window` rather than its container, drove
   * hover with Svelte 5 event syntax that never fires in Svelte 4, and reserved
   * 140px for a label it never drew.
   *
   * Hand-rolled SVG rather than layerchart: the shapes here are six horizontal
   * bars with labels, and doing it directly is what makes the stacked
   * provisional segment, the integer axis and the token colours straightforward.
   */
  import { t } from '$lib/i18n';
  import { fmt } from '$lib/utils/format';
  import type { ExamRecord } from '$lib/db/schema';
  import type { GradeDistributionBucket } from '$lib/analytics/gradingKey';

  export let exam: ExamRecord | null;
  export let gradeBuckets: GradeDistributionBucket[];

  /** Measured from the container, so the chart fits the column it is in. */
  let chartWidth = 0;

  const ROW_HEIGHT = 44;
  const LABEL_WIDTH = 132;
  const VALUE_WIDTH = 92;
  const AXIS_HEIGHT = 24;

  $: total = gradeBuckets.reduce((sum, b) => sum + b.count, 0);

  /**
   * Axis maximum: an integer, with one unit of headroom so the tallest bar does
   * not touch the edge. Counts are whole students — a "1.5" tick, which is what
   * d3's default generator produced on a [0,3] domain, is meaningless here.
   */
  $: axisMax = Math.max(1, ...gradeBuckets.map((b) => b.count)) + 1;
  $: tickStep = Math.max(1, Math.ceil(axisMax / 6));
  $: ticks = Array.from({ length: Math.floor(axisMax / tickStep) + 1 }, (_, i) => i * tickStep);

  $: plotWidth = Math.max(80, chartWidth - LABEL_WIDTH - VALUE_WIDTH);
  $: chartHeight = gradeBuckets.length * ROW_HEIGHT + AXIS_HEIGHT;

  function barWidth(count: number): number {
    return axisMax === 0 ? 0 : (count / axisMax) * plotWidth;
  }

  let hoveredGrade: string | null = null;
</script>

<section class="rounded-xl border border-line bg-surface-raised p-4 sm:p-6">
  <h3 class="text-base font-semibold text-content">{$t('stats.gradeDistribution.title')}</h3>
  <p class="mt-1 text-xs text-muted">
    {$t('stats.gradeDistribution.gradingKeyPrefix')}
    {#if exam?.gradingKey?.preset === 'linear_50'}{$t('stats.gradeDistribution.presets.linear50')}
    {:else if exam?.gradingKey?.preset === 'linear_40'}{$t('stats.gradeDistribution.presets.linear40')}
    {:else if exam?.gradingKey?.preset === 'even_split'}{$t('stats.gradeDistribution.presets.evenSplit')}
    {:else if exam?.gradingKey}{$t('stats.gradeDistribution.presets.custom')}
    {:else}{$t('stats.gradeDistribution.presets.standard')}{/if}
  </p>

  <div class="mt-4 w-full min-w-0" bind:clientWidth={chartWidth}>
    {#if chartWidth > 0}
      <svg
        width={chartWidth}
        height={chartHeight}
        viewBox="0 0 {chartWidth} {chartHeight}"
        role="img"
        aria-label={$t('stats.gradeDistribution.title')}
      >
        {#each ticks as tick}
          <line
            x1={LABEL_WIDTH + barWidth(tick)}
            y1="0"
            x2={LABEL_WIDTH + barWidth(tick)}
            y2={chartHeight - AXIS_HEIGHT}
            stroke="var(--color-line)"
            stroke-width="1"
          />
          <text
            x={LABEL_WIDTH + barWidth(tick)}
            y={chartHeight - 8}
            text-anchor="middle"
            font-size="11"
            fill="var(--color-subtle)"
          >
            {tick}
          </text>
        {/each}

        {#each gradeBuckets as bucket, i (bucket.grade + i)}
          {@const y = i * ROW_HEIGHT}
          {@const confirmed = bucket.count - bucket.provisionalCount}
          <g
            on:mouseenter={() => (hoveredGrade = bucket.grade)}
            on:mouseleave={() => (hoveredGrade = null)}
            role="presentation"
          >
            <rect
              x="0"
              y={y}
              width={chartWidth}
              height={ROW_HEIGHT}
              fill={hoveredGrade === bucket.grade ? 'var(--color-surface-inset)' : 'transparent'}
              opacity="0.5"
            />
            <text x="0" y={y + 20} font-size="15" font-weight="700" fill="var(--color-accent)">
              {bucket.grade}
            </text>
            <text x="22" y={y + 20} font-size="12" fill="var(--color-muted)">
              {bucket.label}
            </text>
            <text x="22" y={y + 35} font-size="10" fill="var(--color-subtle)">
              {$t('stats.gradeDistribution.fromPercent', { percent: bucket.minPercentage })}
            </text>

            <!-- Zero-count grades still draw a hairline, so the scale reads as
                 1–6 rather than as "the grades that occurred". -->
            <rect
              x={LABEL_WIDTH}
              y={y + 10}
              width={Math.max(barWidth(confirmed), bucket.count === 0 ? 2 : 0)}
              height={ROW_HEIGHT - 22}
              rx="3"
              fill={bucket.count === 0 ? 'var(--color-line)' : 'var(--color-accent-strong)'}
            />
            {#if bucket.provisionalCount > 0}
              <!-- Provisional results stack on top in a lighter tone: these
                   pupils are not finished, and a bar that is mostly provisional
                   should read that way at a glance. -->
              <rect
                x={LABEL_WIDTH + barWidth(confirmed)}
                y={y + 10}
                width={barWidth(bucket.provisionalCount)}
                height={ROW_HEIGHT - 22}
                rx="3"
                fill="var(--color-accent)"
                opacity="0.45"
              />
            {/if}

            <text
              x={LABEL_WIDTH + barWidth(bucket.count) + 8}
              y={y + 24}
              font-size="12"
              fill="var(--color-content)"
            >
              {bucket.count}
              {#if total > 0}
                <tspan fill="var(--color-subtle)">
                  ({$fmt.percent(bucket.count / total, 0)})
                </tspan>
              {/if}
            </text>
          </g>
        {/each}
      </svg>
    {/if}
  </div>

  {#if gradeBuckets.some((b) => b.provisionalCount > 0)}
    <p class="mt-2 flex items-center gap-2 text-xs text-subtle">
      <span class="inline-block h-2 w-4 rounded-sm bg-accent opacity-45"></span>
      {$t('stats.gradeDistribution.provisionalLegend')}
    </p>
  {/if}
</section>
