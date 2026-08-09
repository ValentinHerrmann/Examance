<script lang="ts">
  import "./VariantFairnessTable.css";
  import type { VariantGroupComparison } from '$lib/analytics/analyticsTypes';

  export let variantGroups: VariantGroupComparison[];
  export let displayedVariantGroups: VariantGroupComparison[];
  export let showAll: boolean;
</script>

<div class="vft-section-card vft-margin-bottom">
  <div class="vft-section-header-row">
    <div class="vft-section-title-group">
      <h3>🔀 Exercise Variant Difficulty & Fairness Comparison</h3>
      <p>Compare performance between different question variants (e.g. Gruppe A vs Gruppe B) to detect unintended difficulty imbalances.</p>
    </div>
    {#if variantGroups.some((g) => g.variants.some((v) => v.avgScorePercent === null))}
      <button
        class="vft-toggle-btn"
        on:click={() => (showAll = !showAll)}
      >
        {showAll ? 'Show Only Graded Exercises' : 'Show All Exercises (Inc. Ungraded)'}
      </button>
    {/if}
  </div>

  {#if displayedVariantGroups.length === 0}
    <div class="vft-empty-analytics-box">
      <div class="vft-empty-icon">🔀</div>
      <h4>No Multi-Variant Exercise Groups Configured</h4>
      <p>
        {#if variantGroups.length > 0}
          {variantGroups.length} multi-variant question group(s) are linked to your exams, but none have student grades recorded yet.
        {:else}
          When you create exercises with variants (e.g. Variant A & Variant B for different test groups), side-by-side fairness ratings and difficulty delta metrics will appear here.
        {/if}
      </p>
      {#if variantGroups.length > 0}
        <button
          class="vft-secondary-toggle-btn"
          on:click={() => (showAll = !showAll)}
        >
          {showAll ? 'Hide Ungraded Exercises' : `Show All ${variantGroups.length} Variant Groups`}
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
                  ⚠️ {vGroup.maxDeltaPercent}% Difficulty Disparity
                {:else}
                  ✓ {vGroup.maxDeltaPercent}% Variance (Balanced)
                {/if}
              </div>
            {:else if vGroup.variants.some((v) => v.avgScorePercent !== null)}
              <span class="vft-status-badge vft-neutral">Partial Data (1 Variant Graded)</span>
            {:else}
              <span class="vft-status-badge vft-neutral">Awaiting Grading Scores</span>
            {/if}
          </div>

          <table class="vft-analytics-table vft-compact">
            <thead>
              <tr>
                <th>Variant Key</th>
                <th>Max Points</th>
                <th>Avg Score %</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {#each vGroup.variants as v}
                <tr>
                  <td class="variant-key-cell">
                    <span class="variant-badge">{v.variantKey}</span>
                  </td>
                  <td>{v.maxPoints} Pkt</td>
                  <td>
                    {#if v.avgScorePercent !== null}
                      <div class="vft-score-bar-container">
                        <div
                          class="vft-score-bar"
                          style="width: {v.avgScorePercent}%"
                          class:vft-low-bar={v.avgScorePercent < 60}
                        ></div>
                        <span class="vft-score-text">{v.avgScorePercent}%</span>
                      </div>
                    {:else}
                      <span class="vft-no-data-text">N/A (Not Graded)</span>
                    {/if}
                  </td>
                  <td>
                    {#if v.avgScorePercent === null}
                      <span class="vft-status-badge vft-neutral">No Graded Data</span>
                    {:else if v.avgScorePercent < 60}
                      <span class="vft-status-badge vft-danger">Harder Variant</span>
                    {:else}
                      <span class="vft-status-badge vft-success">Normal Range</span>
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
