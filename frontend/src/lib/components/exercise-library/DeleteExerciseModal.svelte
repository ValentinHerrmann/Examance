<script lang="ts">
  import "./DeleteExerciseModal.css";
  import type { ExerciseRecord } from "$lib/db/schema";

  export let isOpen = false;
  export let deletingExercise: ExerciseRecord | null = null;
  export let isDeleteLoading = false;
  export let deleteUsageInfo: { examCount: number; exams: { id: string; title: string; datum: string | null }[] } | null = null;
  export let onConfirm: () => void;
  export let onClose: () => void;
</script>

{#if isOpen && deletingExercise}
  <div
    class="delete-exercise-modal-backdrop"
    role="button"
    tabindex="-1"
    on:click|self={onClose}
    on:keydown|self={(e) => e.key === "Escape" && onClose()}
  >
    <div class="delete-exercise-modal-content delete-exercise-modal-small-modal">
      <div class="delete-exercise-modal-header">
        <h3>Delete Exercise: {deletingExercise.name || "Untitled"}</h3>
        <button class="delete-exercise-modal-close-btn" on:click={onClose}>✕</button>
      </div>

      <div class="delete-exercise-modal-body">
        {#if isDeleteLoading}
          <p>Checking exercise usage in exams...</p>
        {:else if deleteUsageInfo && deleteUsageInfo.examCount > 0}
          <div class="delete-exercise-modal-warning-box">
            <h4>⚠️ Warning: Exercise in Use</h4>
            <p>
              This exercise is currently referenced in <strong>{deleteUsageInfo.examCount}</strong> exam(s):
            </p>
            <ul class="delete-exercise-modal-exam-list">
              {#each deleteUsageInfo.exams as exam}
                <li>
                  <strong>{exam.title}</strong>
                  {#if exam.datum}<span class="delete-exercise-modal-exam-date">({exam.datum})</span>{/if}
                </li>
              {/each}
            </ul>
            <p class="delete-exercise-modal-warning-note">
              Deleting it will permanently remove it from the library and unlink it from these exams.
            </p>
          </div>
        {:else}
          <p>Are you sure you want to delete this exercise from your library?</p>
        {/if}
      </div>

      <div class="delete-exercise-modal-footer">
        <button class="delete-exercise-modal-cancel-btn" on:click={onClose}>Cancel</button>
        <button class="delete-exercise-modal-delete-confirm-btn" on:click={onConfirm} disabled={isDeleteLoading}>
          Delete Anyway
        </button>
      </div>
    </div>
  </div>
{/if}
