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
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/75"
    on:click|self={onClose}
    on:keydown|self={(e) => e.key === "Escape" && onClose()}
    tabindex="-1"
    role="dialog"
  >
    <div class="flex max-h-[90vh] w-[90%] max-w-[500px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
      <div class="flex items-center justify-between border-b border-slate-700 px-6 py-4">
        <h3 class="m-0 text-sky-400">Re-group Exercise</h3>
        <button class="cursor-pointer border-0 bg-transparent text-xl text-slate-400" on:click={onClose}>✕</button>
      </div>

      <div class="flex-1 overflow-y-auto p-6">
        <p style="margin-top: 0; margin-bottom: 1.25rem; color: #e2e8f0;">
          Move <strong>{regroupingExercise.name}</strong> to a different variant group.
        </p>

        <div class="mb-4 flex flex-col gap-[0.375rem]">
          <label for="targetGroup" class="text-sm text-slate-300">Target Group</label>
          <select
            id="targetGroup"
            bind:value={regroupTargetGroupId}
            class="rounded-md border border-slate-700 bg-slate-900 p-[0.625rem] text-white"
          >
            <option value="NEW">+ Create New Group</option>
            {#each groups as group}
              {#if group.groupId !== regroupingExercise.exerciseGroupId}
                <option value={group.groupId}>{group.name}</option>
              {/if}
            {/each}
          </select>
        </div>
      </div>

      <div class="flex justify-end gap-4 border-t border-slate-700 px-6 py-4">
        <button class="cursor-pointer rounded-md border-0 bg-slate-700 px-5 py-[0.625rem] text-white" on:click={onClose}>Cancel</button>
        <button class="cursor-pointer rounded-md border-0 bg-green-600 px-5 py-[0.625rem] font-semibold text-white" on:click={onSave}>Move</button>
      </div>
    </div>
  </div>
{/if}
