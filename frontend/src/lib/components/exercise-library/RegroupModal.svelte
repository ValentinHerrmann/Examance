<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";

  interface VariantMember {
    ex: ExerciseRecord;
    variantLabel: string;
    version: number;
    isCurrent: boolean;
  }

  interface ExerciseGroup {
    groupId: string;
    name: string;
    topicTag: string;
    grade?: string;
    subject?: string;
    maxPoints: number;
    minPoints: number;
    variants: Map<string, VariantMember[]>;
    allMembers: VariantMember[];
  }

  export let isOpen = false;
  export let regroupingExercise: ExerciseRecord | null = null;
  export let regroupTargetGroupId = "";
  export let groups: ExerciseGroup[] = [];
  export let onSave: () => void;
  export let onClose: () => void;
</script>

{#if isOpen && regroupingExercise}
  <div
    class="modal-backdrop"
    on:click|self={onClose}
    on:keydown|self={(e) => e.key === "Escape" && onClose()}
    tabindex="-1"
    role="dialog"
  >
    <div class="modal-content small-modal">
      <div class="modal-header">
        <h3>Re-group Exercise</h3>
        <button class="close-btn" on:click={onClose}>✕</button>
      </div>

      <div class="modal-body">
        <p style="margin-top: 0; margin-bottom: 1.25rem; color: #e2e8f0;">
          Move <strong>{regroupingExercise.name}</strong> to a different variant group.
        </p>

        <div class="form-group">
          <label for="targetGroup">Target Group</label>
          <select id="targetGroup" bind:value={regroupTargetGroupId}>
            <option value="NEW">+ Create New Group</option>
            {#each groups as group}
              {#if group.groupId !== regroupingExercise.exerciseGroupId}
                <option value={group.groupId}>{group.name}</option>
              {/if}
            {/each}
          </select>
        </div>
      </div>

      <div class="modal-footer">
        <button class="cancel-btn" on:click={onClose}>Cancel</button>
        <button class="save-btn" on:click={onSave}>Move</button>
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

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-bottom: 1rem;
  }

  label {
    font-size: 0.875rem;
    color: #cbd5e1;
  }

  select {
    padding: 0.625rem;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: white;
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

  .save-btn {
    background: #16a34a;
    color: white;
    border: none;
    padding: 0.625rem 1.25rem;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
  }
</style>
