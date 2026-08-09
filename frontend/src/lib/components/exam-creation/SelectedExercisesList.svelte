<script lang="ts">
  import "./SelectedExercisesList.css";
  import type { ExerciseRecord } from "$lib/db/schema";
  import { parseExerciseScore } from "$lib/latex/scoreParser";

  export let selectedExercises: ExerciseRecord[];
  export let totalPoints: number;
  export let isPreviewLoading: boolean;
  export let onLivePreview: () => void;
  export let onQuickEdit: (ex: ExerciseRecord) => void;
  export let onMoveExercise: (index: number, direction: "up" | "down") => void;
  export let onRemove: (id: string) => void;
</script>

<div class="selected-exercises-list-card">
  <div class="selected-exercises-list-header">
    <h3>
      3. Exam Structure ({selectedExercises.length} Exercises | Total: {totalPoints}
      Pkt)
    </h3>
    <button
      type="button"
      class="selected-exercises-list-preview-btn"
      class:is-loading={isPreviewLoading}
      on:click={onLivePreview}
      disabled={isPreviewLoading || selectedExercises.length === 0}
    >
      {isPreviewLoading ? "Compiling Preview..." : "🔍 Live Preview PDF"}
    </button>
  </div>

  {#if selectedExercises.length === 0}
    <div class="selected-exercises-list-empty-hint">
      No exercises selected yet. Pick exercises from the library above.
    </div>
  {:else}
    <div class="selected-exercises-list-container">
      {#each selectedExercises as ex, idx}
        {@const score = parseExerciseScore(ex.latexBody || "") || ex.maxPoints || 0}
        <div class="selected-exercises-list-item">
          <div class="selected-exercises-list-item-info">
            <span class="selected-exercises-list-order-num">({idx + 1})</span>
            <strong>{ex.name}</strong>
            {#if ex.topicTag}
              <span class="selected-exercises-list-topic-tag">{ex.topicTag}</span>
            {/if}
            <span class="selected-exercises-list-score-badge">{score} Pkt</span>
          </div>
          <div class="selected-exercises-list-order-controls">
            <button
              type="button"
              class="selected-exercises-list-edit-item-btn"
              title="Quick Edit Exercise Globally"
              on:click={() => onQuickEdit(ex)}
            >
              ✏️
            </button>
            <button
              type="button"
              class="selected-exercises-list-order-btn"
              disabled={idx === 0}
              on:click={() => onMoveExercise(idx, "up")}
            >
              ▲
            </button>
            <button
              type="button"
              class="selected-exercises-list-order-btn"
              disabled={idx === selectedExercises.length - 1}
              on:click={() => onMoveExercise(idx, "down")}
            >
              ▼
            </button>
            <button
              type="button"
              class="selected-exercises-list-remove-btn"
              on:click={() => onRemove(ex.id)}
            >
              ✕
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
