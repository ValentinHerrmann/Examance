<script lang="ts">
  import './SubmissionHistogram.css';
  import { t } from '$lib/i18n';
  import type { PercentageHistogramBin } from '$lib/analytics/stats';
  import { Chart, Svg, Axis, Bars } from 'layerchart';
  import { scaleBand } from 'd3-scale';
  import { viewportWidth } from '$lib/stores/viewport';

  export let bins: PercentageHistogramBin[];

  const barFill = '#0284c7';
  const barHoverFill = '#38bdf8';
  const tickColor = '#94a3b8';

  const histogramXScale = scaleBand();

  $: chartWidth = Math.min(700, $viewportWidth - 80);

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

<div class="submission-histogram-section">
  <h3>{$t('stats.submissionHistogram.title')}</h3>
  {#if histogramData.length > 0}
    <div class="submission-histogram-chart-container h-[clamp(15rem,45vw,22rem)]">
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
