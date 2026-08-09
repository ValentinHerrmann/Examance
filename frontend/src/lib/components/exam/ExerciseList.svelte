<script lang="ts">
  import "./ExerciseList.css";
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
        <button class="exercise-move-btn" on:click={() => onMoveUp(i)} disabled={i === 0}>↑</button>
        <button class="exercise-move-btn" on:click={() => onMoveDown(i)} disabled={i === exercises.length - 1}>↓</button>
        <button class="exercise-remove-btn" on:click={() => onRemove(exercise.id)}>✕</button>
      </div>
    </div>
  {/each}

  {#if exercises.length === 0}
    <div class="empty-exercises">
      <p>Noch keine Aufgaben hinzugefügt.</p>
    </div>
  {/if}
</div>
