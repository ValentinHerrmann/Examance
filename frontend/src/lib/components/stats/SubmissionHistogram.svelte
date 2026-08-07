<script lang="ts">
  import type { PercentageHistogramBin } from '$lib/analytics/stats';
  import { Chart, Svg, Axis, Bars } from 'layerchart';
  import { scaleBand } from 'd3-scale';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  export let bins: PercentageHistogramBin[];

  let chartWidth = 700;
  const barFill = '#0284c7';
  const barHoverFill = '#38bdf8';
  const tickColor = '#94a3b8';

  const histogramXScale = scaleBand();

  onMount(() => {
    if (browser) {
      chartWidth = Math.min(700, window.innerWidth - 80);
    }
  });

  $: histogramData = bins
    .filter((bin) => bin.count > 0)
    .map((bin) => ({
      label: `${bin.binStart}-${bin.binEnd}%`,
      count: bin.count,
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

<div class="histogram-section">
  <h3>📊 Prozentverteilung</h3>
  {#if histogramData.length > 0}
    <div class="chart-container histogram-container">
      <Chart
        data={histogramData}
        x="label"
        y="count"
        xScale={histogramXScale}
        yDomain={[0, Math.max(1, ...histogramData.map(d => d.count))]}
        padding={{ top: 20, right: 20, bottom: 60, left: 50 }}
        width={chartWidth}
        height={250}
      >
        <Svg>
          <Axis
            placement="bottom"
            tickLength={0}
            tickLabelProps={{
              dy: 12,
              transform: 'rotate(-45)',
              fill: tickColor,
              fontSize: 11,
            }}
            rule={{ style: 'stroke: #64748b' }}
          />
          <Axis
            placement="left"
            tickLength={0}
            tickLabelProps={{ fill: tickColor, fontSize: 11 }}
            rule={{ style: 'stroke: #64748b' }}
            grid={{ style: 'stroke: #334155' }}
          />
          <Bars
            data={histogramData}
            x="label"
            y="count"
            fill={barFill}
            radius={4}
            rounded="top"
            stroke="none"
            onpointerenter={handleBarPointerEnter}
            onpointerleave={handleBarPointerLeave}
          />
        </Svg>
      </Chart>
    </div>
  {/if}
</div>

<style>
  .histogram-section {
    background: #0f172a;
    padding: 1.5rem;
    border-radius: 8px;
    margin-bottom: 2rem;
  }

  .histogram-section h3 {
    margin-top: 0;
    color: #f8fafc;
  }

  .chart-container {
    margin-top: 1rem;
    overflow: hidden;
    position: relative;
  }

  .histogram-container {
    height: 290px;
  }
</style>
