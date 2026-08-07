<script lang="ts">
  import type { ExamRecord } from '$lib/db/schema';
  import type { GradeDistributionBucket } from '$lib/analytics/gradingKey';
  import { Chart, Svg, Axis, Bars } from 'layerchart';
  import { scaleBand } from 'd3-scale';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  export let exam: ExamRecord | null;
  export let gradeBuckets: GradeDistributionBucket[];

  let chartWidth = 700;
  const barFill = '#0284c7';
  const barHoverFill = '#38bdf8';
  const tickColor = '#94a3b8';

  const gradeYScale = scaleBand();

  onMount(() => {
    if (browser) {
      chartWidth = Math.min(700, window.innerWidth - 80);
    }
  });

  $: gradeData = gradeBuckets
    .filter((bucket) => bucket.count > 0)
    .map((bucket) => ({
      grade: String(bucket.grade),
      label: bucket.label,
      count: bucket.count,
    }));

  function handleBarPointerEnter(e: PointerEvent) {
    const bar = (e.currentTarget as Element).querySelector('rect, path');
    if (bar) bar.setAttribute('fill', barHoverFill);
  }

  function handleBarPointerLeave(e: PointerEvent) {
    const bar = (e.currentTarget as Element).querySelector('rect, path');
    if (bar) bar.setAttribute('fill', barFill);
  }
</script>

<div class="grade-distribution-section">
  <h3>🎯 Notenverteilung</h3>
  <p class="grading-key-label">
    Bewertungsmaßstab: {#if exam?.gradingKey?.preset === 'linear_50'}Linear (50%){:else if exam?.gradingKey?.preset === 'linear_40'}Linear (40%){:else if exam?.gradingKey?.preset === 'even_split'}Gleichmäßig{:else if exam?.gradingKey}Benutzerdefiniert{:else}Standard (50%){/if}
  </p>
  <div class="chart-container grade-container">
    <Chart
      data={gradeData}
      y="grade"
      x="count"
      yScale={gradeYScale}
      xDomain={[0, Math.max(1, ...gradeData.map(d => d.count))]}
      padding={{ top: 10, right: 60, bottom: 10, left: 140 }}
      width={chartWidth}
      height={Math.max(200, gradeData.length * 50)}
    >
      <Svg>
        <Axis
          placement="left"
          tickLength={0}
          tickLabelProps={{ fill: '#38bdf8', fontSize: 16, fontWeight: 700 }}
          rule={false}
        />
        <Axis
          placement="bottom"
          tickLength={0}
          tickLabelProps={{ fill: tickColor, fontSize: 11 }}
          rule={{ style: 'stroke: #64748b' }}
          grid={{ style: 'stroke: #334155' }}
        />
        <Bars
          data={gradeData}
          y="grade"
          x="count"
          fill={barFill}
          radius={4}
          rounded="right"
          stroke="none"
          onpointerenter={handleBarPointerEnter}
          onpointerleave={handleBarPointerLeave}
        />
      </Svg>
    </Chart>
  </div>
</div>

<style>
  .grade-distribution-section {
    background: #0f172a;
    padding: 1.5rem;
    border-radius: 8px;
    margin-bottom: 2rem;
  }

  .grade-distribution-section h3 {
    margin-top: 0;
    color: #f8fafc;
  }

  .grading-key-label {
    font-size: 0.8rem;
    color: #64748b;
    margin-bottom: 1rem;
  }

  .chart-container {
    margin-top: 1rem;
    overflow: hidden;
    position: relative;
  }

  .grade-container {
    height: 350px;
  }
</style>
