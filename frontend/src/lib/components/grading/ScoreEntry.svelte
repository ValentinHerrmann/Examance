<script lang="ts">
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

<div class="ex-list-header">
  <h3>Exercises ({exercises.length})</h3>
  <span class="header-sub">Click row to set stamp target</span>
</div>

<div class="ex-list-scroll">
  {#each exercises as ex}
    <div
      class="ex-item-compact"
      class:active={ex.id === $gradingStore.activeExerciseId}
      on:click={() => selectExercise(ex.id)}
      role="button"
      tabindex="0"
      on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectExercise(ex.id); }}
    >
      <div class="ex-num-box">
        <span class="ex-num">Q{ex.orderIndex}</span>
        {#if ex.id === $gradingStore.activeExerciseId}
          <span class="target-dot" title="Stamp Target">🎯</span>
        {/if}
      </div>

      <div class="ex-score-wrap">
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
        <span class="ex-max-pts">/ {ex.maxPoints}</span>
        <button
          type="button"
          class="reset-btn-compact"
          title="Als unkorrigiert zurücksetzen"
          on:click={(e) => resetScore(ex, e)}>×</button>
      </div>

      {#if $gradingStore.manualOverride[ex.id]}
        <span class="override-indicator" title="Manually edited">•</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .ex-list-header {
    flex-shrink: 0;
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid #1e293b;
    background: #1e293b;
  }

  .ex-list-header h3 {
    margin: 0;
    font-size: 0.875rem;
    color: #38bdf8;
    font-weight: 700;
  }

  .header-sub {
    font-size: 0.675rem;
    color: #64748b;
  }

  .ex-list-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .ex-item-compact {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.35rem 0.5rem;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    gap: 0.4rem;
  }

  .ex-item-compact:hover {
    border-color: #475569;
    background: #273549;
  }

  .ex-item-compact.active {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.12);
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.15);
  }

  .ex-num-box {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .ex-num {
    font-weight: 700;
    font-size: 0.8rem;
    color: #f1f5f9;
  }

  .target-dot {
    font-size: 0.75rem;
  }

  .ex-score-wrap {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .ex-score-wrap input {
    width: 48px;
    padding: 0.2rem 0.3rem;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 4px;
    color: #38bdf8;
    font-weight: 700;
    font-size: 0.8rem;
    text-align: right;
  }

  .ex-max-pts {
    font-size: 0.725rem;
    color: #94a3b8;
  }

  .reset-btn-compact {
    padding: 0 0.3rem;
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    font-size: 0.9rem;
    line-height: 1;
    border-radius: 3px;
  }

  .reset-btn-compact:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.15);
  }

  .override-indicator {
    color: #f59e0b;
    font-size: 1rem;
    line-height: 1;
  }
</style>
