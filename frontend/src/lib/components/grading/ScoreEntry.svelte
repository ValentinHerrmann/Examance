<script lang="ts">
  import "./ScoreEntry.css";
  import type { ExerciseRecord } from "$lib/db/schema";
  import { gradingStore } from "$lib/grading/gradingStore";

  export let exercises: ExerciseRecord[];

  function selectExercise(id: string) {
    gradingStore.setActiveExerciseId(id);
  }

  function handleScoreInput(ex: ExerciseRecord, e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    const raw = target.value.trim();
    gradingStore.setManualOverrideFlag(ex.id, true);
    if (raw === '') {
      gradingStore.setScoreInput(ex.id, null);
    } else {
      const parsed = parseFloat(raw);
      gradingStore.setScoreInput(ex.id, isNaN(parsed) ? null : Math.max(0, Math.min(ex.maxPoints, parsed)));
    }
  }

  function resetScore(ex: ExerciseRecord, e: MouseEvent) {
    e.stopPropagation();
    gradingStore.setScoreInput(ex.id, null);
    gradingStore.setManualOverrideFlag(ex.id, false);
  }
</script>

<div class="score-entry-ex-list-header">
  <h3>Exercises ({exercises.length})</h3>
  <span class="score-entry-header-sub">Click row to set stamp target</span>
</div>

<div class="score-entry-ex-list-scroll">
  {#each exercises as ex}
    <div
      class="score-entry-ex-item-compact"
      class:score-entry-active={ex.id === $gradingStore.activeExerciseId}
      on:click={() => selectExercise(ex.id)}
      role="button"
      tabindex="0"
      on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectExercise(ex.id); }}
    >
      <div class="score-entry-ex-num-box">
        <span class="score-entry-ex-num">Q{ex.orderIndex}</span>
        {#if ex.id === $gradingStore.activeExerciseId}
          <span class="score-entry-target-dot" title="Stamp Target">🎯</span>
        {/if}
      </div>

      <div class="score-entry-ex-score-wrap">
        <input
          id={`score-${ex.id}`}
          type="number"
          step="0.25"
          min="0"
          max={ex.maxPoints}
          placeholder="–"
          value={$gradingStore.scoreInputs[ex.id] ?? ''}
          on:input={(e) => handleScoreInput(ex, e)}
        />
        <span class="score-entry-ex-max-pts">/ {ex.maxPoints}</span>
        <button
          type="button"
          class="score-entry-reset-btn-compact"
          title="Als unkorrigiert zurücksetzen"
          on:click={(e) => resetScore(ex, e)}>×</button>
      </div>

      {#if $gradingStore.manualOverride[ex.id]}
        <span class="score-entry-override-indicator" title="Manually edited">•</span>
      {/if}
    </div>
  {/each}
</div>
