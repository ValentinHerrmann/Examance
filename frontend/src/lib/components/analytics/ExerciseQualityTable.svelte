<script lang="ts">
  import "./ExerciseQualityTable.css";
  import type { ExercisePerformance } from '$lib/analytics/analyticsTypes';

  export let exerciseStats: ExercisePerformance[];
  export let displayedExerciseStats: ExercisePerformance[];
  export let examsCount: number;
  export let showAll: boolean;
</script>

<div class="eqt-section-card">
  <div class="eqt-section-header-row">
    <div class="eqt-section-title-group">
      <h3>📈 Exercise & Question Quality Metrics</h3>
      <p>Identify questions that consistently produce low average scores across multiple years or exam sessions.</p>
    </div>

    {#if exerciseStats.some((e) => e.avgScorePercent === null)}
      <button
        class="eqt-toggle-btn"
        on:click={() => (showAll = !showAll)}
      >
        {showAll ? 'Show Only Graded Exercises' : 'Show All Exercises (Inc. Ungraded)'}
      </button>
    {/if}
  </div>

  {#if displayedExerciseStats.length === 0}
    <div class="eqt-empty-analytics-box">
      <div class="eqt-empty-icon">📊</div>
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
          class="eqt-secondary-toggle-btn"
          on:click={() => (showAll = !showAll)}
        >
          {showAll ? 'Hide Ungraded Exercises' : `Show All ${exerciseStats.length} Linked Questions`}
        </button>
      {/if}
    </div>
  {:else}
    <table class="eqt-analytics-table">
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
          <tr class:eqt-problematic-row={ex.flaggedProblematic}>
            <td class="eqt-ex-name">{ex.name}</td>
            <td><span class="eqt-tag">{ex.topicTag || 'General'}</span></td>
            <td>{ex.totalAppeared} Exam(s)</td>
            <td>
              {#if ex.avgScorePercent !== null}
                <div class="eqt-score-bar-container">
                  <div
                    class="eqt-score-bar"
                    style="width: {ex.avgScorePercent}%"
                    class:eqt-low-bar={ex.flaggedProblematic}
                  ></div>
                  <span class="eqt-score-text">{ex.avgScorePercent}%</span>
                </div>
              {:else}
                <span class="eqt-no-data-text">N/A (Not Graded)</span>
              {/if}
            </td>
            <td>
              {#if ex.avgScorePercent === null}
                <span class="eqt-status-badge eqt-neutral">No Graded Data</span>
              {:else if ex.flaggedProblematic}
                <span class="eqt-status-badge eqt-danger">⚠️ High Failure Rate</span>
              {:else}
                <span class="eqt-status-badge eqt-success">✓ Balanced</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
