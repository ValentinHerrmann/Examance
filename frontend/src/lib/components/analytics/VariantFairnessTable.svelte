<script lang="ts">
  import type { VariantGroupComparison } from '$lib/analytics/analyticsTypes';

  export let variantGroups: VariantGroupComparison[];
  export let displayedVariantGroups: VariantGroupComparison[];
  export let showAll: boolean;
</script>

<div class="section-card margin-bottom">
  <div class="section-header-row">
    <div class="section-title-group">
      <h3>🔀 Exercise Variant Difficulty & Fairness Comparison</h3>
      <p>Compare performance between different question variants (e.g. Gruppe A vs Gruppe B) to detect unintended difficulty imbalances.</p>
    </div>
    {#if variantGroups.some((g) => g.variants.some((v) => v.avgScorePercent === null))}
      <button
        class="toggle-btn"
        on:click={() => (showAll = !showAll)}
      >
        {showAll ? 'Show Only Graded Exercises' : 'Show All Exercises (Inc. Ungraded)'}
      </button>
    {/if}
  </div>

  {#if displayedVariantGroups.length === 0}
    <div class="empty-analytics-box">
      <div class="empty-icon">🔀</div>
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
          class="secondary-toggle-btn"
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
                <span class="tag">{vGroup.topicTag}</span>
              {/if}
            </div>
            {#if vGroup.maxDeltaPercent !== null}
              <div class="delta-badge" class:warning={vGroup.flaggedFairnessIssue}>
                {#if vGroup.flaggedFairnessIssue}
                  ⚠️ {vGroup.maxDeltaPercent}% Difficulty Disparity
                {:else}
                  ✓ {vGroup.maxDeltaPercent}% Variance (Balanced)
                {/if}
              </div>
            {:else if vGroup.variants.some((v) => v.avgScorePercent !== null)}
              <span class="status-badge neutral">Partial Data (1 Variant Graded)</span>
            {:else}
              <span class="status-badge neutral">Awaiting Grading Scores</span>
            {/if}
          </div>

          <table class="analytics-table compact">
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
                      <div class="score-bar-container">
                        <div
                          class="score-bar"
                          style="width: {v.avgScorePercent}%"
                          class:low-bar={v.avgScorePercent < 60}
                        ></div>
                        <span class="score-text">{v.avgScorePercent}%</span>
                      </div>
                    {:else}
                      <span class="no-data-text">N/A (Not Graded)</span>
                    {/if}
                  </td>
                  <td>
                    {#if v.avgScorePercent === null}
                      <span class="status-badge neutral">No Graded Data</span>
                    {:else if v.avgScorePercent < 60}
                      <span class="status-badge danger">Harder Variant</span>
                    {:else}
                      <span class="status-badge success">Normal Range</span>
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

<style>
  .section-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 1.75rem;
  }

  .section-card.margin-bottom {
    margin-bottom: 0;
  }

  .section-header-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .section-title-group h3 {
    margin: 0 0 0.35rem 0;
    font-size: 1.25rem;
    color: #f8fafc;
  }

  .section-title-group p {
    margin: 0;
    font-size: 0.875rem;
    color: #94a3b8;
  }

  .toggle-btn {
    background: #334155;
    color: #38bdf8;
    border: 1px solid #0284c7;
    padding: 0.45rem 0.85rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s ease;
  }

  .toggle-btn:hover {
    background: #0284c7;
    color: white;
  }

  .empty-analytics-box {
    text-align: center;
    padding: 3rem 1.5rem;
    background: #0f172a;
    border: 1px dashed #334155;
    border-radius: 10px;
    margin-top: 1rem;
  }

  .empty-icon {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
  }

  .empty-analytics-box h4 {
    margin: 0 0 0.5rem 0;
    font-size: 1.15rem;
    color: #f8fafc;
  }

  .empty-analytics-box p {
    margin: 0 0 1.25rem 0;
    font-size: 0.9rem;
    color: #94a3b8;
    max-width: 540px;
    margin-left: auto;
    margin-right: auto;
  }

  .secondary-toggle-btn {
    background: #0284c7;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }

  .secondary-toggle-btn:hover {
    background: #0369a1;
  }

  .variant-groups-list {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .variant-group-card {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 10px;
    padding: 1.25rem;
  }

  .variant-group-card.fairness-warning {
    border-color: #eab308;
  }

  .variant-group-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .variant-group-header h4 {
    margin: 0 0 0.25rem 0;
    font-size: 1.1rem;
    color: #38bdf8;
  }

  .delta-badge {
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.3rem 0.75rem;
    border-radius: 6px;
    background: #1e293b;
    color: #10b981;
    border: 1px solid #047857;
  }

  .delta-badge.warning {
    background: rgba(234, 179, 8, 0.15);
    color: #fef08a;
    border-color: #eab308;
  }

  .variant-key-cell {
    width: 130px;
  }

  .variant-badge {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.2rem 0.55rem;
    background: #0284c7;
    color: white;
    border-radius: 4px;
  }

  .analytics-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .analytics-table.compact td,
  .analytics-table.compact th {
    padding: 0.65rem 0.85rem;
  }

  .analytics-table th {
    text-align: left;
    padding: 0.75rem 1rem;
    background: #0f172a;
    color: #cbd5e1;
    border-bottom: 1px solid #334155;
    font-weight: 600;
  }

  .analytics-table td {
    padding: 0.85rem 1rem;
    border-bottom: 1px solid #334155;
    color: #cbd5e1;
  }

  .tag {
    font-size: 0.75rem;
    padding: 0.2rem 0.5rem;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 4px;
    color: #38bdf8;
  }

  .score-bar-container {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 160px;
  }

  .score-bar {
    height: 8px;
    background: #10b981;
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .score-bar.low-bar {
    background: #ef4444;
  }

  .score-text {
    font-weight: 600;
    font-size: 0.85rem;
  }

  .no-data-text {
    color: #64748b;
    font-size: 0.85rem;
    font-style: italic;
  }

  .status-badge {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
  }

  .status-badge.danger {
    background: #7f1d1d;
    color: #fecdd3;
  }

  .status-badge.success {
    background: #064e3b;
    color: #a7f3d0;
  }

  .status-badge.neutral {
    background: #334155;
    color: #94a3b8;
  }
</style>
