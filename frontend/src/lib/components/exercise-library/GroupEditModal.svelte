<script lang="ts">
  import "./GroupEditModal.css";
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
    class="group-edit-modal-backdrop"
    role="button"
    tabindex="-1"
    on:click|self={onClose}
    on:keydown|self={(e) => e.key === "Escape" && onClose()}
  >
    <div class="group-edit-modal-content group-edit-modal-small-modal">
      <div class="group-edit-modal-header">
        <h3>Edit Exercise Group Metadata</h3>
        <button class="group-edit-modal-close-btn" on:click={onClose}>✕</button>
      </div>

      <div class="group-edit-modal-body">
        <div class="group-edit-modal-live-notice" style="margin-bottom: 1rem;">
          ℹ️ Changes apply to all variants ({editingGroup.allMembers.length}) in this group.
        </div>

        <div class="group-edit-modal-form-group">
          <label for="groupEditorName">Exercise Group Name</label>
          <input
            id="groupEditorName"
            type="text"
            bind:value={groupEditorName}
            required
          />
        </div>

        <div class="group-edit-modal-form-group">
          <label for="groupEditorTopic">Topic Tag</label>
          <input
            id="groupEditorTopic"
            type="text"
            bind:value={groupEditorTopicTag}
            placeholder="_Vererbung"
            required
          />
        </div>

        <div class="group-edit-modal-form-group">
          <label for="groupEditorGrade">Grade / Klasse</label>
          <input
            id="groupEditorGrade"
            type="text"
            bind:value={groupEditorGrade}
            placeholder="e.g. 10, 10a, 12"
          />
        </div>

        <div class="group-edit-modal-form-group">
          <label for="groupEditorSubject">Subject / Fach</label>
          <input
            id="groupEditorSubject"
            type="text"
            bind:value={groupEditorSubject}
            placeholder="e.g. Informatik, Mathematik"
          />
        </div>
      </div>

      <div class="group-edit-modal-footer">
        <button class="group-edit-modal-cancel-btn" on:click={onClose}>Cancel</button>
        <button class="group-edit-modal-save-btn" on:click={onSave} disabled={isGroupSaving}>
          {isGroupSaving ? "Saving..." : "Save Group Metadata"}
        </button>
      </div>
    </div>
  </div>
{/if}
