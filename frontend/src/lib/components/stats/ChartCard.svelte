<script lang="ts">
  /**
   * A stats chart in a card, with SVG/PDF/PNG download. Exports render an
   * offscreen copy at a fixed size, so the file looks the same whatever width
   * the card has on screen (a phone would thin labels).
   */
  import { tick } from 'svelte';
  import { t } from '$lib/i18n';
  import { Button, Card } from '$lib/components/ui';
  import ColumnChart from './ColumnChart.svelte';
  import type { ChartCurve, ChartLayer, ChartMarker, ChartSpan } from './chartColumns';
  import { downloadBlob, serializeChartSvg, svgToPdf, svgToPng } from './chartExport';

  export let title: string;
  export let subtitle = '';
  export let layers: ChartLayer[];
  export let domain: number;
  export let axisLabel = '';
  export let plotHeight = 200;
  export let markers: ChartMarker[] = [];
  export let spans: ChartSpan[] = [];
  export let curve: ChartCurve | null = null;
  /** Exam title, for the file name and the document title. */
  export let examTitle = '';
  /** File name part after the exam title, e.g. `notenverteilung`. */
  export let fileName: string;
  let className = '';
  export { className as class };

  const EXPORT_WIDTH = 1200;
  const EXPORT_PLOT = 420;
  type ExportFormat = 'svg' | 'pdf' | 'png';
  const EXPORT_FORMATS: ExportFormat[] = ['svg', 'pdf', 'png'];

  let exportSvg: SVGSVGElement | null = null;
  let exporting: ExportFormat | null = null;

  async function download(format: ExportFormat) {
    if (exporting) return;
    exporting = format;
    try {
      await tick();
      if (!exportSvg) return;
      const docTitle = [title.replace(/^\P{L}+/u, ''), examTitle].filter(Boolean).join(' — ');
      const markup = serializeChartSvg(exportSvg, docTitle);
      const blob =
        format === 'svg'
          ? new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })
          : format === 'pdf'
            ? await svgToPdf(markup, docTitle)
            : await svgToPng(markup);
      const safe = (examTitle || 'exam').replace(/[^a-z0-9_-]/gi, '_');
      downloadBlob(blob, `${safe}_${fileName}.${format}`);
    } finally {
      exporting = null;
    }
  }
</script>

<Card class={className}>
  <div class="mb-4 flex flex-wrap items-start justify-between gap-2">
    <div class="min-w-0 flex-1 basis-64">
      <h3 class="text-base font-semibold text-content">{title}</h3>
      {#if subtitle}
        <p class="mt-1 text-xs text-muted">{subtitle}</p>
      {/if}
    </div>
    <div class="flex shrink-0 items-center gap-1" role="group" aria-label={$t('stats.download.group')}>
      <span class="mr-1 text-xs text-subtle" aria-hidden="true">⬇</span>
      {#each EXPORT_FORMATS as format}
        <Button
          variant="ghost"
          size="sm"
          loading={exporting === format}
          disabled={exporting !== null}
          title={$t(`stats.download.${format}`)}
          ariaLabel={$t(`stats.download.${format}`)}
          onClick={() => download(format)}>{format.toUpperCase()}</Button
        >
      {/each}
    </div>
  </div>
  <ColumnChart {domain} {plotHeight} {layers} {markers} {spans} {curve} {axisLabel} ariaLabel={title} />
  <slot />
  {#if exporting}
    <div class="pointer-events-none fixed top-0 -left-[10000px]" style="width: {EXPORT_WIDTH}px" aria-hidden="true">
      <ColumnChart bind:svgEl={exportSvg} plotHeight={EXPORT_PLOT} {domain} {layers} {markers} {spans} {curve} {axisLabel} ariaLabel={title} />
    </div>
  {/if}
</Card>
