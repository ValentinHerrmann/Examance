<script lang="ts">
  // Stats chart in a card with SVG/PDF/PNG download; exports render an off-screen copy (renderChart.ts) at a fixed size.
  import type { Snippet } from 'svelte';
  import { t } from '#lib/i18n';
  import { faDownload } from '@fortawesome/free-solid-svg-icons';
  import { Button, Card, Icon } from '#lib/components/ui';
  import ColumnChart from './ColumnChart.svelte';
  import type { ChartCurve, ChartLayer, ChartMarker, ChartSpan } from './chartColumns';
  import { downloadBlob, svgToPdf, svgToPng } from './chartExport';
  import { renderChartSvg } from './renderChart';

  
  interface Props {
    title: string;
    subtitle?: string;
    layers: ChartLayer[];
    domain: number;
    axisLabel?: string;
    plotHeight?: number;
    markers?: ChartMarker[];
    spans?: ChartSpan[];
    curve?: ChartCurve | null;
    /** Exam title, for the file name and the document title. */
    examTitle?: string;
    /** File name part after the exam title, e.g. `notenverteilung`. */
    fileName: string;
    class?: string;
    children?: Snippet;
  }

  let {
    title,
    subtitle = '',
    layers,
    domain,
    axisLabel = '',
    plotHeight = 200,
    markers = [],
    spans = [],
    curve = null,
    examTitle = '',
    fileName,
    class: className = '',
    children
  }: Props = $props();

  type ExportFormat = 'svg' | 'pdf' | 'png';
  const EXPORT_FORMATS: ExportFormat[] = ['svg', 'pdf', 'png'];

  let exporting: ExportFormat | null = $state(null);

  async function download(format: ExportFormat) {
    if (exporting) return;
    exporting = format;
    try {
      const docTitle = [title.replace(/^\P{L}+/u, ''), examTitle].filter(Boolean).join(' — ');
      const markup = renderChartSvg({ domain, layers, markers, spans, curve, axisLabel, ariaLabel: title }, docTitle);
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
      <Icon icon={faDownload} class="mr-1 text-sm text-muted" />
      {#each EXPORT_FORMATS as format}
        <Button
          variant="text"
          severity="secondary"
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
  {@render children?.()}
</Card>
