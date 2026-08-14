<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import SuggestInput from "$lib/components/common/SuggestInput.svelte";
  import { recordValue } from "$lib/utils/recentValues";

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

  function handleSave() {
    if (groupEditorTopicTag) recordValue("exercise.topic", groupEditorTopicTag);
    if (groupEditorGrade) recordValue("exercise.grade", groupEditorGrade);
    if (groupEditorSubject) recordValue("exercise.subject", groupEditorSubject);
    onSave();
  }
</script>

{#if isOpen && editingGroup}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/75"
    role="button"
    tabindex="-1"
    on:click|self={onClose}
    on:keydown|self={(e) => e.key === "Escape" && onClose()}
  >
    <div class="flex max-h-[90vh] w-[90%] max-w-[500px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
      <div class="flex items-center justify-between border-b border-slate-700 px-6 py-4">
        <h3 class="m-0 text-sky-400">Edit Exercise Group Metadata</h3>
        <button class="cursor-pointer border-0 bg-transparent text-xl text-slate-400" on:click={onClose}>✕</button>
      </div>

      <div class="flex-1 overflow-y-auto p-6">
        <div class="mb-4 bg-sky-600/20 px-6 py-2 text-[0.85rem] text-sky-300">
          ℹ️ Changes apply to all variants ({editingGroup.allMembers.length}) in this group.
        </div>

        <div class="mb-4 flex flex-col gap-[0.375rem]">
          <label for="groupEditorName" class="text-sm text-slate-300">Exercise Group Name</label>
          <input
            id="groupEditorName"
            type="text"
            bind:value={groupEditorName}
            required
            class="rounded-md border border-slate-700 bg-slate-900 p-[0.625rem] text-white"
          />
        </div>

        <div class="mb-4 flex flex-col gap-[0.375rem]">
          <label for="groupEditorTopic" class="text-sm text-slate-300">Topic Tag</label>
          <SuggestInput
            id="groupEditorTopic"
            storageKey="exercise.topic"
            bind:value={groupEditorTopicTag}
            placeholder="_Vererbung"
            required
            class="rounded-md border border-slate-700 bg-slate-900 p-[0.625rem] text-white"
          />
        </div>

        <div class="mb-4 flex flex-col gap-[0.375rem]">
          <label for="groupEditorGrade" class="text-sm text-slate-300">Grade / Klasse</label>
          <SuggestInput
            id="groupEditorGrade"
            storageKey="exercise.grade"
            bind:value={groupEditorGrade}
            placeholder="e.g. 10, 10a, 12"
            class="rounded-md border border-slate-700 bg-slate-900 p-[0.625rem] text-white"
          />
        </div>

        <div class="mb-4 flex flex-col gap-[0.375rem]">
          <label for="groupEditorSubject" class="text-sm text-slate-300">Subject / Fach</label>
          <SuggestInput
            id="groupEditorSubject"
            storageKey="exercise.subject"
            bind:value={groupEditorSubject}
            placeholder="e.g. Informatik, Mathematik"
            class="rounded-md border border-slate-700 bg-slate-900 p-[0.625rem] text-white"
          />
        </div>
      </div>

      <div class="flex justify-end gap-4 border-t border-slate-700 px-6 py-4">
        <button class="cursor-pointer rounded-md border-0 bg-slate-700 px-5 py-[0.625rem] text-white" on:click={onClose}>Cancel</button>
        <button
          class="cursor-pointer rounded-md border-0 bg-green-600 px-5 py-[0.625rem] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          on:click={handleSave}
          disabled={isGroupSaving}
        >
          {isGroupSaving ? "Saving..." : "Save Group Metadata"}
        </button>
      </div>
    </div>
  </div>
{/if}
