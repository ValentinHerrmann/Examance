<script context="module" lang="ts">
  export interface ExamItemRef {
    type: "exercise" | "mc_group";
    id: string;
  }
</script>

<script lang="ts">
  import "./SelectedExercisesList.css";
  import type { ExerciseRecord } from "$lib/db/schema";
  import { parseExerciseScore } from "$lib/latex/scoreParser";

  interface McGroup {
    id: string;
    title: string;
    scoringText: string;
    memberIds: string[];
  }

  export let selectedExercises: ExerciseRecord[];
  export let totalPoints: number;
  export let isPreviewLoading: boolean;
  export let onLivePreview: () => void;
  export let onQuickEdit: (ex: ExerciseRecord) => void;
  export let onMoveExercise: (index: number, direction: "up" | "down") => void;
  export let onMoveExamItem: ((index: number, direction: "up" | "down") => void) | undefined = undefined;
  export let onRemove: (id: string) => void;
  export let mcGroups: McGroup[] = [];
  export let libraryExercises: ExerciseRecord[] = [];
  export let examItems: ExamItemRef[] = [];
  export let onRemoveMcGroup: (id: string) => void = () => {};

  function memberExercises(group: McGroup): ExerciseRecord[] {
    return group.memberIds
      .map((id) => libraryExercises.find((e) => e.id === id) || selectedExercises.find((e) => e.id === id))
      .filter((e): e is ExerciseRecord => Boolean(e));
  }

  function groupPoints(group: McGroup): number {
    return memberExercises(group).reduce(
      (sum, ex) => sum + (parseExerciseScore(ex.latexBody || "") || ex.maxPoints || 0),
      0,
    );
  }

  $: totalItemCount = examItems.length > 0 ? examItems.length : selectedExercises.length + mcGroups.length;
</script>

<div class="selected-exercises-list-card">
  <div class="selected-exercises-list-header">
    <h3>
      3. Exam Structure ({totalItemCount} Items | Total: {totalPoints}
      Pkt)
    </h3>
    <button
      type="button"
      class="selected-exercises-list-preview-btn"
      class:is-loading={isPreviewLoading}
      on:click={onLivePreview}
      disabled={isPreviewLoading || totalItemCount === 0}
    >
      {isPreviewLoading ? "Compiling Preview..." : "🔍 Live Preview PDF"}
    </button>
  </div>

  {#if totalItemCount === 0}
    <div class="selected-exercises-list-empty-hint">
      No exercises selected yet. Pick exercises from the library above.
    </div>
  {:else}
    <div class="selected-exercises-list-container">
      {#if examItems.length > 0}
        {#each examItems as item, idx (item.id)}
          {#if item.type === "exercise"}
            {@const ex = selectedExercises.find((e) => e.id === item.id) || libraryExercises.find((e) => e.id === item.id)}
            {#if ex}
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
                    on:click={() => onMoveExamItem ? onMoveExamItem(idx, "up") : onMoveExercise(idx, "up")}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    class="selected-exercises-list-order-btn"
                    disabled={idx === examItems.length - 1}
                    on:click={() => onMoveExamItem ? onMoveExamItem(idx, "down") : onMoveExercise(idx, "down")}
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
            {/if}
          {:else if item.type === "mc_group"}
            {@const group = mcGroups.find((g) => g.id === item.id)}
            {#if group}
              <div class="selected-exercises-list-item" style="flex-direction: column; align-items: stretch; gap: 0.4rem;">
                <div class="selected-exercises-list-item-info" style="justify-content: space-between;">
                  <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                    <span class="selected-exercises-list-order-num">({idx + 1})</span>
                    <strong>MC Aufgabe: {group.title}</strong>
                    <span class="selected-exercises-list-topic-tag">MC ({memberExercises(group).length} sub-items)</span>
                    <span class="selected-exercises-list-score-badge">{groupPoints(group)} Pkt</span>
                  </div>
                  <div class="selected-exercises-list-order-controls">
                    <button
                      type="button"
                      class="selected-exercises-list-order-btn"
                      disabled={idx === 0}
                      on:click={() => onMoveExamItem && onMoveExamItem(idx, "up")}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      class="selected-exercises-list-order-btn"
                      disabled={idx === examItems.length - 1}
                      on:click={() => onMoveExamItem && onMoveExamItem(idx, "down")}
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      class="selected-exercises-list-remove-btn"
                      on:click={() => onRemoveMcGroup(group.id)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <ul style="margin: 0; padding-left: 1.4rem; font-size: 0.85rem; color: #94a3b8;">
                  {#each memberExercises(group) as ex, i}
                    <li>{String.fromCharCode(97 + i)}) {ex.name}</li>
                  {/each}
                </ul>
              </div>
            {/if}
          {/if}
        {/each}
      {:else}
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

        {#each mcGroups as group}
          <div class="selected-exercises-list-item" style="flex-direction: column; align-items: stretch; gap: 0.4rem;">
            <div class="selected-exercises-list-item-info">
              <strong>MC Aufgabe: {group.title}</strong>
              <span class="selected-exercises-list-topic-tag">MC ({memberExercises(group).length} sub-items)</span>
              <span class="selected-exercises-list-score-badge">{groupPoints(group)} Pkt</span>
              <button
                type="button"
                class="selected-exercises-list-remove-btn"
                on:click={() => onRemoveMcGroup(group.id)}
              >
                ✕
              </button>
            </div>
            <ul style="margin: 0; padding-left: 1.4rem; font-size: 0.85rem; color: #94a3b8;">
              {#each memberExercises(group) as ex, i}
                <li>{String.fromCharCode(97 + i)}) {ex.name}</li>
              {/each}
            </ul>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
