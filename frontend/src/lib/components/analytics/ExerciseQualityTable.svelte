<script lang="ts">
  import { faChartColumn } from '@fortawesome/free-solid-svg-icons';
  import { Badge, Button, Card, EmptyState, TableScroller } from "#lib/components/ui";
  import { t } from '#lib/i18n';
  import { fmt } from '#lib/utils/format';
  import type { ExercisePerformance } from '#lib/analytics/analyticsTypes';

  interface Props {
    exerciseStats: ExercisePerformance[];
    displayedExerciseStats: ExercisePerformance[];
    examsCount: number;
    showAll: boolean;
  }

  let {
    exerciseStats,
    displayedExerciseStats,
    examsCount,
    showAll = $bindable()
  }: Props = $props();
</script>

<Card>
  <div class="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
    <div class="min-w-0 flex-1 basis-64">
      <h3 class="m-0 text-xl font-medium text-content">{$t('stats.exerciseQuality.title')}</h3>
      <p class="m-0 mt-1 text-sm text-muted">{$t('stats.exerciseQuality.description')}</p>
    </div>

    {#if exerciseStats.some((e) => e.avgScorePercent === null)}
      <Button variant="outlined" severity="secondary" size="sm" onClick={() => (showAll = !showAll)}>
        {showAll ? $t('stats.shared.toggleShowGraded') : $t('stats.shared.toggleShowAll')}
      </Button>
    {/if}
  </div>

  {#if displayedExerciseStats.length === 0}
    <EmptyState
      icon={faChartColumn}
      title={$t('stats.exerciseQuality.emptyTitle')}
      description={exerciseStats.length > 0
        ? $t('stats.exerciseQuality.emptyWithData', { count: $fmt.number(exerciseStats.length), examsCount: $fmt.number(examsCount) })
        : $t('stats.exerciseQuality.emptyNoData')}
    >
      {#snippet actions()}
        {#if exerciseStats.length > 0}
          <Button variant="outlined" severity="secondary" onClick={() => (showAll = !showAll)}>
            {showAll ? $t('stats.shared.hideUngraded') : $t('stats.exerciseQuality.showAllLinked', { count: $fmt.number(exerciseStats.length) })}
          </Button>
        {/if}
      {/snippet}
    </EmptyState>
  {:else}
    <TableScroller>
      <table class="data-table data-table-hover">
        <thead>
          <tr>
            <th>{$t('stats.exerciseQuality.colName')}</th>
            <th>{$t('stats.exerciseQuality.colTopicTag')}</th>
            <th>{$t('stats.exerciseQuality.colExamsIncluded')}</th>
            <th>{$t('stats.exerciseQuality.colAvgScore')}</th>
            <th>{$t('stats.exerciseQuality.colQualityStatus')}</th>
          </tr>
        </thead>
        <tbody>
          {#each displayedExerciseStats as ex}
            <tr class={ex.flaggedProblematic ? 'bg-danger/5' : ''}>
              <td class="font-semibold">{ex.name}</td>
              <td><Badge size="xs">{ex.topicTag || $t('stats.exerciseQuality.generalTag')}</Badge></td>
              <td>{$t('stats.exerciseQuality.examsCountSuffix', { count: $fmt.number(ex.totalAppeared) })}</td>
              <td>
                {#if ex.avgScorePercent !== null}
                  <div class="flex w-40 items-center gap-3">
                    <div
                      class="h-2 rounded-md {ex.flaggedProblematic ? 'bg-danger' : 'bg-success'}"
                      style="width: {ex.avgScorePercent}%"
                    ></div>
                    <span class="font-semibold">{$fmt.percent(ex.avgScorePercent / 100, 0)}</span>
                  </div>
                {:else}
                  <span class="text-muted">{$t('stats.shared.notGraded')}</span>
                {/if}
              </td>
              <td>
                {#if ex.avgScorePercent === null}
                  <Badge size="xs">{$t('stats.shared.noGradedData')}</Badge>
                {:else if ex.flaggedProblematic}
                  <Badge severity="danger" size="xs">{$t('stats.exerciseQuality.highFailureRate')}</Badge>
                {:else}
                  <Badge severity="success" size="xs">{$t('stats.exerciseQuality.balanced')}</Badge>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </TableScroller>
  {/if}
</Card>
