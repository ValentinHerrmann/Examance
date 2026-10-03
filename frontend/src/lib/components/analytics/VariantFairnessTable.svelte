<script lang="ts">
  import { faShuffle } from '@fortawesome/free-solid-svg-icons';
  import { Badge, Button, Card, EmptyState, TableScroller } from "$lib/components/ui";
  import { t } from '$lib/i18n';
  import { fmt } from '$lib/utils/format';
  import type { VariantGroupComparison } from '$lib/analytics/analyticsTypes';

  interface Props {
    variantGroups: VariantGroupComparison[];
    displayedVariantGroups: VariantGroupComparison[];
    showAll: boolean;
  }

  let { variantGroups, displayedVariantGroups, showAll = $bindable() }: Props = $props();
</script>

<Card class="mb-6">
  <div class="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
    <div class="min-w-0 flex-1 basis-64">
      <h3 class="m-0 text-xl font-medium text-content">{$t('stats.variantFairness.title')}</h3>
      <p class="m-0 mt-1 text-sm text-muted">{$t('stats.variantFairness.description')}</p>
    </div>
    {#if variantGroups.some((g) => g.variants.some((v) => v.avgScorePercent === null))}
      <Button variant="outlined" severity="secondary" size="sm" onClick={() => (showAll = !showAll)}>
        {showAll ? $t('stats.shared.toggleShowGraded') : $t('stats.shared.toggleShowAll')}
      </Button>
    {/if}
  </div>

  {#if displayedVariantGroups.length === 0}
    <EmptyState
      icon={faShuffle}
      title={$t('stats.variantFairness.emptyTitle')}
      description={variantGroups.length > 0
        ? $t('stats.variantFairness.emptyWithData', { count: $fmt.number(variantGroups.length) })
        : $t('stats.variantFairness.emptyNoData')}
    >
      {#snippet actions()}
        {#if variantGroups.length > 0}
          <Button variant="outlined" severity="secondary" onClick={() => (showAll = !showAll)}>
            {showAll ? $t('stats.shared.hideUngraded') : $t('stats.variantFairness.showAllGroups', { count: $fmt.number(variantGroups.length) })}
          </Button>
        {/if}
      {/snippet}
    </EmptyState>
  {:else}
    <div class="flex flex-col gap-6">
      {#each displayedVariantGroups as vGroup}
        <section class="min-w-0 border-t pt-4 {vGroup.flaggedFairnessIssue ? 'border-warning' : 'border-line'}">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <h4 class="m-0 text-base font-semibold text-content">{vGroup.groupName}</h4>
              {#if vGroup.topicTag}
                <Badge size="xs">{vGroup.topicTag}</Badge>
              {/if}
            </div>
            {#if vGroup.maxDeltaPercent !== null}
              {#if vGroup.flaggedFairnessIssue}
                <Badge severity="warning">{$t('stats.variantFairness.difficultyDisparity', { delta: $fmt.number(vGroup.maxDeltaPercent) })}</Badge>
              {:else}
                <Badge severity="success">{$t('stats.variantFairness.varianceBalanced', { delta: $fmt.number(vGroup.maxDeltaPercent) })}</Badge>
              {/if}
            {:else if vGroup.variants.some((v) => v.avgScorePercent !== null)}
              <Badge size="xs">{$t('stats.variantFairness.partialData')}</Badge>
            {:else}
              <Badge size="xs">{$t('stats.variantFairness.awaitingScores')}</Badge>
            {/if}
          </div>

          <TableScroller>
            <table class="data-table data-table-compact">
              <thead>
                <tr>
                  <th>{$t('stats.variantFairness.colVariantKey')}</th>
                  <th>{$t('stats.variantFairness.colMaxPoints')}</th>
                  <th>{$t('stats.variantFairness.colAvgScore')}</th>
                  <th>{$t('stats.variantFairness.colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {#each vGroup.variants as v}
                  <tr>
                    <td class="w-32"><Badge severity="primary" size="xs">{v.variantKey}</Badge></td>
                    <td>{$t('stats.variantFairness.maxPointsSuffix', { points: $fmt.number(v.maxPoints) })}</td>
                    <td>
                      {#if v.avgScorePercent !== null}
                        <div class="flex w-40 items-center gap-3">
                          <div
                            class="h-2 rounded-md {v.avgScorePercent < 60 ? 'bg-danger' : 'bg-success'}"
                            style="width: {v.avgScorePercent}%"
                          ></div>
                          <span class="font-semibold">{$fmt.percent(v.avgScorePercent / 100, 0)}</span>
                        </div>
                      {:else}
                        <span class="text-muted">{$t('stats.shared.notGraded')}</span>
                      {/if}
                    </td>
                    <td>
                      {#if v.avgScorePercent === null}
                        <Badge size="xs">{$t('stats.shared.noGradedData')}</Badge>
                      {:else if v.avgScorePercent < 60}
                        <Badge severity="danger" size="xs">{$t('stats.variantFairness.harderVariant')}</Badge>
                      {:else}
                        <Badge severity="success" size="xs">{$t('stats.variantFairness.normalRange')}</Badge>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </TableScroller>
        </section>
      {/each}
    </div>
  {/if}
</Card>
