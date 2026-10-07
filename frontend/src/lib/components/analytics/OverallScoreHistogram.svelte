<script lang="ts">
  import { faChartColumn } from '@fortawesome/free-solid-svg-icons';
  import { Card, EmptyState } from '#lib/components/ui';
  import ChartCard from '#lib/components/stats/ChartCard.svelte';
  import { binColumns } from '#lib/components/stats/chartColumns';
  import { t } from '#lib/i18n';
  import { fmt } from '#lib/utils/format';
  import type { OverallScoreDistribution } from '#lib/analytics/overallScores';

  interface Props {
    /** Null until the first load has finished (or failed). */
    distribution: OverallScoreDistribution | null;
    class?: string;
  }

  let { distribution, class: className = '' }: Props = $props();

  const num = (v: number) => $fmt.number(v, { maximumFractionDigits: 2 });
  const share = (count: number, of: number) => $fmt.percent(of > 0 ? count / of : 0, 0);

  // Same mirrored 100 % → 0 % order as the exam charts; the tooltip names the range, count and share.
  let columns = $derived(
    distribution && distribution.counted > 0
      ? binColumns(distribution.bins, num).map((c) => ({
          ...c,
          title: $t('stats.overallHistogram.barTitle', {
            range: c.lines[0],
            count: num(c.count),
            share: share(c.count, distribution.counted)
          })
        }))
      : []
  );
</script>

{#if distribution && distribution.counted > 0}
  {@const total = distribution.counted + distribution.ungraded + distribution.withoutMaxPoints}
  <ChartCard
    class={className}
    title={$t('stats.overallHistogram.title')}
    subtitle={$t('stats.overallHistogram.subtitle')}
    domain={100}
    layers={[{ columns, fill: 0.72, labels: 'axis', values: true }]}
    axisLabel={$t('stats.submissionHistogram.axisLabel')}
    examTitle={$t('nav.analytics')}
    fileName="gesamtverteilung"
  >
    <p class="mt-2 text-xs text-muted">
      {$t('stats.overallHistogram.basis', { counted: num(distribution.counted), total: num(total) })}
      {#if distribution.withoutMaxPoints > 0}
        {$t('stats.overallHistogram.noMaxPoints', { count: num(distribution.withoutMaxPoints) })}
      {/if}
    </p>
    <!-- The SVG is a single image to assistive technology; the same numbers as a table. -->
    <table class="sr-only">
      <caption>{$t('stats.overallHistogram.title')}</caption>
      <thead>
        <tr>
          <th scope="col">{$t('stats.overallHistogram.colRange')}</th>
          <th scope="col">{$t('stats.overallHistogram.colCount')}</th>
          <th scope="col">{$t('stats.overallHistogram.colShare')}</th>
        </tr>
      </thead>
      <tbody>
        {#each columns as c}
          <tr>
            <th scope="row">{c.lines[0]} %</th>
            <td>{num(c.count)}</td>
            <td>{share(c.count, distribution.counted)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </ChartCard>
{:else}
  <Card class={className}>
    <h3 class="text-base font-semibold text-content">{$t('stats.overallHistogram.title')}</h3>
    <p class="mt-1 text-xs text-muted">{$t('stats.overallHistogram.subtitle')}</p>
    <EmptyState
      icon={faChartColumn}
      title={$t('stats.overallHistogram.emptyTitle')}
      description={distribution && distribution.withoutMaxPoints > 0
        ? $t('stats.overallHistogram.emptyNoMaxPoints')
        : $t('stats.overallHistogram.emptyNoGraded')}
    />
  </Card>
{/if}
