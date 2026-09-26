<script lang="ts">
  import { t, type TranslationKey } from '$lib/i18n';
  import { fmt } from '$lib/utils/format';
  import type { ExamRecord } from '$lib/db/schema';
  import type { ExamStats } from '$lib/analytics/stats';
  import { PageShell, PageHeader, Button, Card } from '$lib/components/ui';
  import StatsCards from './StatsCards.svelte';
  import ColumnChart from './ColumnChart.svelte';
  import { binColumns, gradeBands, gradeColumns, type ChartLayer } from './chartColumns';
  import StatsExportModal from './StatsExportModal.svelte';
  import { tick } from 'svelte';
  import { downloadBlob, serializeChartSvg, svgToPdf, svgToPng } from './chartExport';

  export let exam: ExamRecord | null;
  export let stats: ExamStats | null;
  export let totalMaxPoints: number | null;
  export let submissionCount: number;
  export let showConfirmModal: boolean;
  export let onOpenExport: () => void;
  export let onConfirmExport: () => void;
  export let onCancelExport: () => void;

  const PRESETS: Record<string, TranslationKey> = {
    linear_50: 'stats.gradeDistribution.presets.linear50',
    linear_40: 'stats.gradeDistribution.presets.linear40',
    even_split: 'stats.gradeDistribution.presets.evenSplit',
  };
  let preset: TranslationKey;
  $: preset = exam?.gradingKey
    ? (PRESETS[exam.gradingKey.preset] ?? 'stats.gradeDistribution.presets.custom')
    : 'stats.gradeDistribution.presets.standard';

  $: num = (v: number) => $fmt.number(v, { maximumFractionDigits: 2 });
  $: grades = gradeColumns(stats?.gradeBuckets ?? [], $t, $fmt.percent);
  $: bins = binColumns(stats?.bins ?? [], num);
  $: bands = gradeBands(stats?.gradeBuckets ?? [], num, $fmt.percent);
  let combinedLayers: ChartLayer[];
  $: combinedLayers = [
    { columns: bands, fill: 1, labels: 'group', values: false, band: true },
    { columns: bins, fill: 0.5, labels: 'axis', values: true },
  ];
  $: provisional = (stats?.results ?? []).some((r) => !r.isComplete);
  $: histogramSubtitle = stats
    ? stats.binWidth === null
      ? $t('stats.submissionHistogram.subtitleUneven')
      : $t('stats.submissionHistogram.subtitle', { step: num(stats.binWidth) })
    : '';

  $: graded = stats?.results.length ?? 0;
  $: full = stats?.results.filter((r) => r.isComplete).length ?? 0;

  // Exports render an offscreen copy at a fixed size, so the file looks the
  // same whatever width the card has on screen (a phone would thin labels).
  const EXPORT_WIDTH = 1200;
  const EXPORT_PLOT = 420;
  type ExportFormat = 'svg' | 'pdf' | 'png';
  const EXPORT_FORMATS: ExportFormat[] = ['svg', 'pdf', 'png'];
  let exportSvg: SVGSVGElement | null = null;
  let exporting: ExportFormat | null = null;

  async function downloadCombined(format: ExportFormat) {
    if (exporting) return;
    exporting = format;
    try {
      await tick();
      if (!exportSvg) return;
      const examTitle = exam?.title ?? '';
      const title = [$t('stats.combined.title').replace(/^\P{L}+/u, ''), examTitle].filter(Boolean).join(' — ');
      const markup = serializeChartSvg(exportSvg, title);
      const blob =
        format === 'svg'
          ? new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })
          : format === 'pdf'
            ? await svgToPdf(markup, title)
            : await svgToPng(markup);
      const safe = (examTitle || 'exam').replace(/[^a-z0-9_-]/gi, '_');
      downloadBlob(blob, `${safe}_notenverteilung.${format}`);
    } finally {
      exporting = null;
    }
  }
</script>

<PageShell width="wide">
  <PageHeader title={$t('stats.page.title')} />

  {#if submissionCount > 0}
    <div class="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
      <span>{$t('stats.page.statusBanner', { graded, total: submissionCount })}</span>
      {#if graded > full}
        <span class="text-amber-300">
          {$t('stats.page.partialIndicator', { partial: graded - full, full })}
        </span>
      {/if}
      {#if submissionCount > graded}
        <span class="text-subtle">
          {$t('stats.page.pendingIndicator', { pending: submissionCount - graded })}
        </span>
      {/if}
    </div>
  {/if}

  {#if stats?.summary}
    <StatsCards {stats} {totalMaxPoints} />
    <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card>
        <h3 class="text-base font-semibold text-content">{$t('stats.gradeDistribution.title')}</h3>
        <p class="mb-4 mt-1 text-xs text-muted">{$t('stats.gradeDistribution.gradingKeyPrefix')} {$t(preset)}</p>
        <ColumnChart
          domain={grades.length}
          layers={[{ columns: grades, fill: 0.72, labels: 'axis', values: true }]}
          axisLabel={$t('stats.gradeDistribution.axisLabel')}
          ariaLabel={$t('stats.gradeDistribution.title')}
        />
      </Card>
      <Card>
        <h3 class="text-base font-semibold text-content">{$t('stats.submissionHistogram.title')}</h3>
        <p class="mb-4 mt-1 text-xs text-muted">{histogramSubtitle}</p>
        <ColumnChart
          domain={100}
          layers={[{ columns: bins, fill: 0.72, labels: 'axis', values: true }]}
          axisLabel={$t('stats.submissionHistogram.axisLabel')}
          ariaLabel={$t('stats.submissionHistogram.title')}
        />
      </Card>
      <Card class="xl:col-span-2">
        <div class="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0 flex-1 basis-64">
            <h3 class="text-base font-semibold text-content">{$t('stats.combined.title')}</h3>
            <p class="mt-1 text-xs text-muted">{$t('stats.combined.subtitle')}</p>
          </div>
          <div class="flex shrink-0 items-center gap-1" role="group" aria-label={$t('stats.combined.download.group')}>
            <span class="mr-1 text-xs text-subtle" aria-hidden="true">⬇</span>
            {#each EXPORT_FORMATS as format}
              <Button
                variant="ghost"
                size="sm"
                loading={exporting === format}
                disabled={exporting !== null}
                title={$t(`stats.combined.download.${format}`)}
                ariaLabel={$t(`stats.combined.download.${format}`)}
                onClick={() => downloadCombined(format)}>{format.toUpperCase()}</Button
              >
            {/each}
          </div>
        </div>
        <ColumnChart
          domain={100}
          layers={combinedLayers}
          axisLabel={$t('stats.submissionHistogram.axisLabel')}
          ariaLabel={$t('stats.combined.title')}
        />
        {#if exporting}
          <div class="pointer-events-none fixed top-0 -left-[10000px]" style="width: {EXPORT_WIDTH}px" aria-hidden="true">
            <ColumnChart
              bind:svgEl={exportSvg}
              plotHeight={EXPORT_PLOT}
              domain={100}
              layers={combinedLayers}
              axisLabel={$t('stats.submissionHistogram.axisLabel')}
              ariaLabel={$t('stats.combined.title')}
            />
          </div>
        {/if}
      </Card>
    </div>
    {#if provisional}
      <p class="mt-2 flex items-center gap-2 text-xs text-subtle">
        <span class="inline-block h-2 w-4 rounded-sm bg-muted opacity-45"></span>
        {$t('stats.gradeDistribution.provisionalLegend')}
      </p>
    {/if}
  {:else}
    <Card class="text-sm text-muted">{$t('stats.page.emptyStats')}</Card>
  {/if}

  <div class="mt-6">
    <Button variant="secondary" onClick={onOpenExport}>
      {$t('stats.page.exportButton')}
    </Button>
  </div>
</PageShell>

{#if showConfirmModal}
  <StatsExportModal onConfirm={onConfirmExport} onCancel={onCancelExport} />
{/if}
