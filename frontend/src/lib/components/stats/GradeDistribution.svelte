<script lang="ts">
  import './GradeDistribution.css';
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
  <p class="grade-distribution-grading-key-label">
    Bewertungsmaßstab: {#if exam?.gradingKey?.preset === 'linear_50'}Linear (50%){:else if exam?.gradingKey?.preset === 'linear_40'}Linear (40%){:else if exam?.gradingKey?.preset === 'even_split'}Gleichmäßig{:else if exam?.gradingKey}Benutzerdefiniert{:else}Standard (50%){/if}
  </p>
  <div class="grade-distribution-chart-container grade-distribution-grade-container">
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
