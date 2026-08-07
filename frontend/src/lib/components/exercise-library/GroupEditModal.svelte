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
  export let editingGroup: ExerciseGroup | null = null;
  export let groupEditorName = "";
  export let groupEditorTopicTag = "";
  export let groupEditorGrade = "";
  export let groupEditorSubject = "";
  export let isGroupSaving = false;
  export let onSave: () => void;
  export let onClose: () => void;
</script>

{#if isOpen && editingGroup}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="-1"
    on:click|self={onClose}
    on:keydown|self={(e) => e.key === "Escape" && onClose()}
  >
    <div class="modal-content small-modal">
      <div class="modal-header">
        <h3>Edit Exercise Group Metadata</h3>
        <button class="close-btn" on:click={onClose}>✕</button>
      </div>

      <div class="modal-body">
        <div class="live-notice" style="margin-bottom: 1rem;">
          ℹ️ Changes apply to all variants ({editingGroup.allMembers.length}) in this group.
        </div>

        <div class="form-group">
          <label for="groupEditorName">Exercise Group Name</label>
          <input
            id="groupEditorName"
            type="text"
            bind:value={groupEditorName}
            required
          />
        </div>

        <div class="form-group">
          <label for="groupEditorTopic">Topic Tag</label>
          <input
            id="groupEditorTopic"
            type="text"
            bind:value={groupEditorTopicTag}
            placeholder="_Vererbung"
            required
          />
        </div>

        <div class="form-group">
          <label for="groupEditorGrade">Grade / Klasse</label>
          <input
            id="groupEditorGrade"
            type="text"
            bind:value={groupEditorGrade}
            placeholder="e.g. 10, 10a, 12"
          />
        </div>

        <div class="form-group">
          <label for="groupEditorSubject">Subject / Fach</label>
          <input
            id="groupEditorSubject"
            type="text"
            bind:value={groupEditorSubject}
            placeholder="e.g. Informatik, Mathematik"
          />
        </div>
      </div>

      <div class="modal-footer">
        <button class="cancel-btn" on:click={onClose}>Cancel</button>
        <button class="save-btn" on:click={onSave} disabled={isGroupSaving}>
          {isGroupSaving ? "Saving..." : "Save Group Metadata"}
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

  .live-notice {
    background: rgba(2, 132, 199, 0.2);
    color: #7dd3fc;
    padding: 0.5rem 1.5rem;
    font-size: 0.85rem;
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

  input {
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

  .save-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
