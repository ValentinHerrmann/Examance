<script lang="ts">
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
    class="modal-backdrop"
    role="button"
    tabindex="-1"
    on:click|self={onClose}
    on:keydown|self={(e) => e.key === "Escape" && onClose()}
  >
    <div class="modal-content small-modal">
      <div class="modal-header">
        <h3>Delete Exercise: {deletingExercise.name || "Untitled"}</h3>
        <button class="close-btn" on:click={onClose}>✕</button>
      </div>

      <div class="modal-body">
        {#if isDeleteLoading}
          <p>Checking exercise usage in exams...</p>
        {:else if deleteUsageInfo && deleteUsageInfo.examCount > 0}
          <div class="warning-box">
            <h4>⚠️ Warning: Exercise in Use</h4>
            <p>
              This exercise is currently referenced in <strong>{deleteUsageInfo.examCount}</strong> exam(s):
            </p>
            <ul class="exam-list">
              {#each deleteUsageInfo.exams as exam}
                <li>
                  <strong>{exam.title}</strong>
                  {#if exam.datum}<span class="exam-date">({exam.datum})</span>{/if}
                </li>
              {/each}
            </ul>
            <p class="warning-note">
              Deleting it will permanently remove it from the library and unlink it from these exams.
            </p>
          </div>
        {:else}
          <p>Are you sure you want to delete this exercise from your library?</p>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="cancel-btn" on:click={onClose}>Cancel</button>
        <button class="delete-confirm-btn" on:click={onConfirm} disabled={isDeleteLoading}>
          Delete Anyway
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 100;
  }

  .modal-content {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    width: 90%;
    max-width: 800px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .small-modal {
    max-width: 500px;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #334155;
  }

  .modal-header h3 {
    margin: 0;
    color: #38bdf8;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 1.25rem;
    cursor: pointer;
  }

  .modal-body {
    padding: 1.5rem;
    overflow-y: auto;
    flex: 1;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid #334155;
  }

  .cancel-btn {
    background: #334155;
    color: white;
    border: none;
    padding: 0.625rem 1.25rem;
    border-radius: 6px;
    cursor: pointer;
  }

  .delete-confirm-btn {
    background: #dc2626;
    color: white;
    border: none;
    padding: 0.625rem 1.25rem;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
  }

  .delete-confirm-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .warning-box {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid #ef4444;
    border-radius: 8px;
    padding: 1rem;
    color: #fca5a5;
  }

  .warning-box h4 {
    margin: 0 0 0.5rem 0;
    color: #f87171;
  }

  .exam-list {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
    color: #e2e8f0;
  }

  .exam-date {
    color: #94a3b8;
    font-size: 0.85rem;
    margin-left: 0.35rem;
  }

  .warning-note {
    font-size: 0.85rem;
    margin-top: 0.75rem;
    color: #cbd5e1;
  }
</style>
