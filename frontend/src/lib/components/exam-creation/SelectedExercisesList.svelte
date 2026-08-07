<script lang="ts">
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

<div class="section-card">
  <div class="section-header">
    <h3>
      3. Exam Structure ({selectedExercises.length} Exercises | Total: {totalPoints}
      Pkt)
    </h3>
    <button
      type="button"
      class="preview-btn"
      class:is-loading={isPreviewLoading}
      on:click={onLivePreview}
      disabled={isPreviewLoading || selectedExercises.length === 0}
    >
      {isPreviewLoading ? "Compiling Preview..." : "🔍 Live Preview PDF"}
    </button>
  </div>

  {#if selectedExercises.length === 0}
    <div class="empty-hint">
      No exercises selected yet. Pick exercises from the library above.
    </div>
  {:else}
    <div class="selected-list">
      {#each selectedExercises as ex, idx}
        {@const score = parseExerciseScore(ex.latexBody || "") || ex.maxPoints || 0}
        <div class="selected-item">
          <div class="item-info">
            <span class="order-num">({idx + 1})</span>
            <strong>{ex.name}</strong>
            {#if ex.topicTag}
              <span class="topic-tag">{ex.topicTag}</span>
            {/if}
            <span class="score-badge">{score} Pkt</span>
          </div>
          <div class="order-controls">
            <button
              type="button"
              class="edit-item-btn"
              title="Quick Edit Exercise Globally"
              on:click={() => onQuickEdit(ex)}
            >
              ✏️
            </button>
            <button
              type="button"
              class="order-btn"
              disabled={idx === 0}
              on:click={() => onMoveExercise(idx, "up")}
            >
              ▲
            </button>
            <button
              type="button"
              class="order-btn"
              disabled={idx === selectedExercises.length - 1}
              on:click={() => onMoveExercise(idx, "down")}
            >
              ▼
            </button>
            <button
              type="button"
              class="remove-btn"
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

<style>
  .section-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 10px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .section-card h3 {
    margin-top: 0;
    color: #f8fafc;
    font-size: 1.1rem;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }

  .preview-btn {
    background: #0284c7;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .empty-hint {
    color: #94a3b8;
    text-align: center;
    padding: 1.5rem;
    font-size: 0.9rem;
  }

  .selected-list {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .selected-item {
    background: #0f172a;
    border: 1px solid #334155;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .item-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    min-width: 0;
  }

  .order-num {
    color: #38bdf8;
    font-weight: bold;
  }

  .topic-tag {
    font-size: 0.75rem;
    background: #334155;
    color: #cbd5e1;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
  }

  .score-badge {
    background: #0369a1;
    color: #e0f2fe;
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-weight: 600;
  }

  .order-controls {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-wrap: wrap;
  }

  .order-btn {
    background: #334155;
    color: white;
    border: none;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    cursor: pointer;
  }

  .order-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .remove-btn {
    background: transparent;
    color: #ef4444;
    border: none;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    font-size: 1rem;
  }

  .edit-item-btn {
    background: #334155;
    color: white;
    border: none;
    padding: 0.25rem 0.4rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
    margin-right: 0.2rem;
  }

  .edit-item-btn:hover {
    background: #475569;
  }

  @media (max-width: 900px) {
    .section-header {
      align-items: stretch;
    }

    .selected-item {
      flex-wrap: wrap;
      align-items: flex-start;
    }

    .item-info {
      flex-wrap: wrap;
    }

    .order-controls {
      width: 100%;
      justify-content: flex-start;
      flex-wrap: wrap;
    }
  }

  @media (max-width: 640px), (max-height: 760px) and (orientation: landscape) {
    .section-card {
      padding: 1rem;
    }

    .preview-btn {
      width: 100%;
    }
  }
</style>
