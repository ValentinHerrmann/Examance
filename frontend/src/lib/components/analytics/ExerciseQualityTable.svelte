<script lang="ts">
  import type { ExercisePerformance } from '$lib/analytics/analyticsTypes';

  export let exerciseStats: ExercisePerformance[];
  export let displayedExerciseStats: ExercisePerformance[];
  export let examsCount: number;
  export let showAll: boolean;
</script>

<div class="section-card">
  <div class="section-header-row">
    <div class="section-title-group">
      <h3>📈 Exercise & Question Quality Metrics</h3>
      <p>Identify questions that consistently produce low average scores across multiple years or exam sessions.</p>
    </div>

    {#if exerciseStats.some((e) => e.avgScorePercent === null)}
      <button
        class="toggle-btn"
        on:click={() => (showAll = !showAll)}
      >
        {showAll ? 'Show Only Graded Exercises' : 'Show All Exercises (Inc. Ungraded)'}
      </button>
    {/if}
  </div>

  {#if displayedExerciseStats.length === 0}
    <div class="empty-analytics-box">
      <div class="empty-icon">📊</div>
      <h4>No Graded Exercise Performance Data Available</h4>
      <p>
        {#if exerciseStats.length > 0}
          {exerciseStats.length} question(s) are linked across your {examsCount} exam(s), but none have student grades recorded yet.
        {:else}
          No exercises have been linked to your exams yet.
        {/if}
      </p>
      {#if exerciseStats.length > 0}
        <button
          class="secondary-toggle-btn"
          on:click={() => (showAll = !showAll)}
        >
          {showAll ? 'Hide Ungraded Exercises' : `Show All ${exerciseStats.length} Linked Questions`}
        </button>
      {/if}
    </div>
  {:else}
    <table class="analytics-table">
      <thead>
        <tr>
          <th>Exercise Name</th>
          <th>Topic Tag</th>
          <th>Exams Included</th>
          <th>Avg Score %</th>
          <th>Quality Status</th>
        </tr>
      </thead>
      <tbody>
        {#each displayedExerciseStats as ex}
          <tr class:problematic-row={ex.flaggedProblematic}>
            <td class="ex-name">{ex.name}</td>
            <td><span class="tag">{ex.topicTag || 'General'}</span></td>
            <td>{ex.totalAppeared} Exam(s)</td>
            <td>
              {#if ex.avgScorePercent !== null}
                <div class="score-bar-container">
                  <div
                    class="score-bar"
                    style="width: {ex.avgScorePercent}%"
                    class:low-bar={ex.flaggedProblematic}
                  ></div>
                  <span class="score-text">{ex.avgScorePercent}%</span>
                </div>
              {:else}
                <span class="no-data-text">N/A (Not Graded)</span>
              {/if}
            </td>
            <td>
              {#if ex.avgScorePercent === null}
                <span class="status-badge neutral">No Graded Data</span>
              {:else if ex.flaggedProblematic}
                <span class="status-badge danger">⚠️ High Failure Rate</span>
              {:else}
                <span class="status-badge success">✓ Balanced</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .section-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 1.75rem;
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

  .analytics-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
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

  .problematic-row {
    background: rgba(239, 68, 68, 0.05);
  }

  .ex-name {
    font-weight: 600;
    color: #f8fafc;
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
