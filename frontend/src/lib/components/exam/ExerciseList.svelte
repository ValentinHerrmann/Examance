<script lang="ts">
  import type { ExerciseRecord } from '$lib/db/schema';

  export let exercises: ExerciseRecord[];
  export let onRemove: (exerciseId: string) => void;
  export let onMoveUp: (index: number) => void;
  export let onMoveDown: (index: number) => void;
</script>

<div class="exercise-list">
  <h3>Aufgaben ({exercises.length})</h3>

  {#each exercises as exercise, i (exercise.id)}
    <div class="exercise-item">
      <div class="exercise-info">
        <span class="exercise-number">{i + 1}.</span>
        <span class="exercise-title">{exercise.name || exercise.title || 'Untitled'}</span>
        {#if exercise.topicTag}
          <span class="exercise-tag topic">{exercise.topicTag}</span>
        {/if}
        {#if exercise.variantKey}
          <span class="exercise-tag variant">Variant: {exercise.variantKey}</span>
        {/if}
        <span class="exercise-tag version">v{exercise.version || 1}</span>
        <span class="exercise-points">{exercise.maxPoints} Pkt</span>
      </div>
      <div class="exercise-actions">
        <button class="move-btn" on:click={() => onMoveUp(i)} disabled={i === 0}>↑</button>
        <button class="move-btn" on:click={() => onMoveDown(i)} disabled={i === exercises.length - 1}>↓</button>
        <button class="remove-btn" on:click={() => onRemove(exercise.id)}>✕</button>
      </div>
    </div>
  {/each}

  {#if exercises.length === 0}
    <div class="empty-exercises">
      <p>Noch keine Aufgaben hinzugefügt.</p>
    </div>
  {/if}
</div>

<style>
  .exercise-list {
    margin-bottom: 1.5rem;
  }

  h3 {
    color: #38bdf8;
    margin-bottom: 0.75rem;
  }

  .exercise-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: #1e293b;
    border-radius: 6px;
    border: 1px solid #334155;
    margin-bottom: 0.5rem;
  }

  .exercise-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .exercise-number {
    color: #64748b;
    font-weight: 600;
  }

  .exercise-title {
    color: #f8fafc;
  }

  .exercise-points {
    color: #94a3b8;
    font-size: 0.85rem;
  }

  .exercise-tag {
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    border-radius: 4px;
  }

  .exercise-tag.topic {
    background: #0284c7;
    color: white;
  }

  .exercise-tag.variant {
    background: #8b5cf6;
    color: white;
  }

  .exercise-tag.version {
    background: #334155;
    color: #94a3b8;
  }

  .exercise-actions {
    display: flex;
    gap: 0.25rem;
  }

  .move-btn {
    background: #334155;
    color: #f8fafc;
    border: none;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
  }

  .move-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .remove-btn {
    background: #991b1b;
    color: white;
    border: none;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    cursor: pointer;
  }

  .empty-exercises {
    text-align: center;
    padding: 2rem;
    color: #64748b;
    background: #1e293b;
    border-radius: 8px;
    border: 1px dashed #334155;
  }
</style>
