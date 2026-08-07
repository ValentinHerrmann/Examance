<script lang="ts">
  import "./RegroupModal.css";
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
    class="regroup-modal-backdrop"
    on:click|self={onClose}
    on:keydown|self={(e) => e.key === "Escape" && onClose()}
    tabindex="-1"
    role="dialog"
  >
    <div class="regroup-modal-content regroup-modal-small-modal">
      <div class="regroup-modal-header">
        <h3>Re-group Exercise</h3>
        <button class="regroup-modal-close-btn" on:click={onClose}>✕</button>
      </div>

      <div class="regroup-modal-body">
        <p style="margin-top: 0; margin-bottom: 1.25rem; color: #e2e8f0;">
          Move <strong>{regroupingExercise.name}</strong> to a different variant group.
        </p>

        <div class="regroup-modal-form-group">
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

      <div class="regroup-modal-footer">
        <button class="regroup-modal-cancel-btn" on:click={onClose}>Cancel</button>
        <button class="regroup-modal-save-btn" on:click={onSave}>Move</button>
      </div>
    </div>
  </div>
{/if}
