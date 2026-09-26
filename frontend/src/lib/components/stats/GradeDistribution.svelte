<script lang="ts">
  /** Grade distribution — always the full scale; empty grades keep their row. */
  import { t, type TranslationKey } from '$lib/i18n';
  import { fmt } from '$lib/utils/format';
  import { Card } from '$lib/components/ui';
  import { countAxis } from '$lib/analytics/stats';
  import type { ExamRecord } from '$lib/db/schema';
  import { gradeColorVar, type GradeDistributionBucket } from '$lib/analytics/gradingKey';

  export let exam: ExamRecord | null;
  export let buckets: GradeDistributionBucket[];

  const ROW = 44;
  const LABEL = 132;
  const VALUE = 92; // room right of the longest bar for "12 (40 %)"
  const AXIS = 24;
  const MIN_WIDTH = LABEL + 120 + VALUE; // narrower containers scale the drawing down instead of clipping it
  const PRESETS: Record<string, TranslationKey> = {
    linear_50: 'stats.gradeDistribution.presets.linear50',
    linear_40: 'stats.gradeDistribution.presets.linear40',
    even_split: 'stats.gradeDistribution.presets.evenSplit',
  };

  let width = 0;
  let preset: TranslationKey;
  $: preset = exam?.gradingKey
    ? (PRESETS[exam.gradingKey.preset] ?? 'stats.gradeDistribution.presets.custom')
    : 'stats.gradeDistribution.presets.standard';
  $: total = buckets.reduce((sum, b) => sum + b.count, 0);
  $: axis = countAxis(buckets.map((b) => b.count), 6);
  $: vw = Math.max(width, MIN_WIDTH);
  $: plot = vw - LABEL - VALUE;
  $: height = buckets.length * ROW + AXIS;
  $: x = (count: number) => LABEL + (count / axis.max) * plot;
</script>

<Card>
  <h3 class="text-base font-semibold text-content">{$t('stats.gradeDistribution.title')}</h3>
  <p class="mt-1 text-xs text-muted">{$t('stats.gradeDistribution.gradingKeyPrefix')} {$t(preset)}</p>

  <div class="mt-4 w-full min-w-0" bind:clientWidth={width}>
    {#if width > 0}
      <svg {width} height={(height * width) / vw} viewBox="0 0 {vw} {height}" role="img" aria-label={$t('stats.gradeDistribution.title')}>
        {#each axis.ticks as tick}
          <line x1={x(tick)} x2={x(tick)} y1="0" y2={height - AXIS} stroke="var(--color-line)" />
          <text x={x(tick)} y={height - 8} text-anchor="middle" font-size="11" fill="var(--color-subtle)">{tick}</text>
        {/each}

        {#each buckets as bucket, i (bucket.grade + i)}
          {@const y = i * ROW}
          {@const confirmed = bucket.count - bucket.provisionalCount}
          {@const color = gradeColorVar(i, buckets.length)}
          <text x="0" y={y + 20} font-size="15" font-weight="700" fill={color}>{bucket.grade}</text>
          <text x="22" y={y + 20} font-size="12" fill="var(--color-muted)">{bucket.label}</text>
          <text x="22" y={y + 35} font-size="10" fill="var(--color-subtle)">
            {$t('stats.gradeDistribution.fromPercent', { percent: bucket.minPercentage })}
          </text>
          <!-- A zero count still draws a short stub in the grade's colour. -->
          <rect
            x={LABEL}
            y={y + 10}
            width={Math.max(x(confirmed) - LABEL, bucket.count === 0 ? 3 : 0)}
            height={ROW - 22}
            rx="3"
            fill={color}
          />
          {#if bucket.provisionalCount > 0}
            <rect
              x={x(confirmed)}
              y={y + 10}
              width={x(bucket.provisionalCount) - LABEL}
              height={ROW - 22}
              rx="3"
              fill={color}
              opacity="0.45"
            />
          {/if}
          <text x={x(bucket.count) + 8} y={y + 24} font-size="12" fill="var(--color-content)">
            {bucket.count}
            {#if total > 0}<tspan fill="var(--color-subtle)"> ({$fmt.percent(bucket.count / total, 0)})</tspan>{/if}
          </text>
        {/each}
      </svg>
    {/if}
  </div>

  {#if buckets.some((b) => b.provisionalCount > 0)}
    <p class="mt-2 flex items-center gap-2 text-xs text-subtle">
      <span class="inline-block h-2 w-4 rounded-sm bg-muted opacity-45"></span>
      {$t('stats.gradeDistribution.provisionalLegend')}
    </p>
  {/if}
</Card>
