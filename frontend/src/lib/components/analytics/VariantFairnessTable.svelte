<script lang="ts">
  import "./VariantFairnessTable.css";
  import { t } from '$lib/i18n';
  import { fmt } from '$lib/utils/format';
  import type { VariantGroupComparison } from '$lib/analytics/analyticsTypes';

  export let variantGroups: VariantGroupComparison[];
  export let displayedVariantGroups: VariantGroupComparison[];
  export let showAll: boolean;
</script>

<div class="vft-section-card vft-margin-bottom">
  <div class="vft-section-header-row">
    <div class="vft-section-title-group">
      <h3>{$t('stats.variantFairness.title')}</h3>
      <p>{$t('stats.variantFairness.description')}</p>
    </div>
    {#if variantGroups.some((g) => g.variants.some((v) => v.avgScorePercent === null))}
      <button
        class="vft-toggle-btn"
        on:click={() => (showAll = !showAll)}
      >
        {showAll ? $t('stats.shared.toggleShowGraded') : $t('stats.shared.toggleShowAll')}
      </button>
    {/if}
  </div>

  {#if displayedVariantGroups.length === 0}
    <div class="vft-empty-analytics-box">
      <div class="vft-empty-icon">🔀</div>
      <h4>{$t('stats.variantFairness.emptyTitle')}</h4>
      <p>
        {#if variantGroups.length > 0}
          {$t('stats.variantFairness.emptyWithData', { count: $fmt.number(variantGroups.length) })}
        {:else}
          {$t('stats.variantFairness.emptyNoData')}
        {/if}
      </p>
      {#if variantGroups.length > 0}
        <button
          class="vft-secondary-toggle-btn"
          on:click={() => (showAll = !showAll)}
        >
          {showAll ? $t('stats.shared.hideUngraded') : $t('stats.variantFairness.showAllGroups', { count: $fmt.number(variantGroups.length) })}
        </button>
      {/if}
    </div>
  {:else}
    <div class="variant-groups-list">
      {#each displayedVariantGroups as vGroup}
        <div class="variant-group-card" class:fairness-warning={vGroup.flaggedFairnessIssue}>
          <div class="variant-group-header">
            <div>
              <h4>{vGroup.groupName}</h4>
              {#if vGroup.topicTag}
                <span class="vft-tag">{vGroup.topicTag}</span>
              {/if}
            </div>
            {#if vGroup.maxDeltaPercent !== null}
              <div class="delta-badge" class:vft-warning={vGroup.flaggedFairnessIssue}>
                {#if vGroup.flaggedFairnessIssue}
                  {$t('stats.variantFairness.difficultyDisparity', { delta: $fmt.number(vGroup.maxDeltaPercent) })}
                {:else}
                  {$t('stats.variantFairness.varianceBalanced', { delta: $fmt.number(vGroup.maxDeltaPercent) })}
                {/if}
              </div>
            {:else if vGroup.variants.some((v) => v.avgScorePercent !== null)}
              <span class="vft-status-badge vft-neutral">{$t('stats.variantFairness.partialData')}</span>
            {:else}
              <span class="vft-status-badge vft-neutral">{$t('stats.variantFairness.awaitingScores')}</span>
            {/if}
          </div>

          <table class="vft-analytics-table vft-compact">
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
                  <td class="variant-key-cell">
                    <span class="variant-badge">{v.variantKey}</span>
                  </td>
                  <td>{$t('stats.variantFairness.maxPointsSuffix', { points: $fmt.number(v.maxPoints) })}</td>
                  <td>
                    {#if v.avgScorePercent !== null}
                      <div class="vft-score-bar-container">
                        <div
                          class="vft-score-bar"
                          style="width: {v.avgScorePercent}%"
                          class:vft-low-bar={v.avgScorePercent < 60}
                        ></div>
                        <span class="vft-score-text">{$fmt.percent(v.avgScorePercent / 100, 0)}</span>
                      </div>
                    {:else}
                      <span class="vft-no-data-text">{$t('stats.shared.notGraded')}</span>
                    {/if}
                  </td>
                  <td>
                    {#if v.avgScorePercent === null}
                      <span class="vft-status-badge vft-neutral">{$t('stats.shared.noGradedData')}</span>
                    {:else if v.avgScorePercent < 60}
                      <span class="vft-status-badge vft-danger">{$t('stats.variantFairness.harderVariant')}</span>
                    {:else}
                      <span class="vft-status-badge vft-success">{$t('stats.variantFairness.normalRange')}</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/each}
    </div>
  {/if}
</div>
