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
    class="fixed inset-0 w-screen h-screen bg-black/75 flex justify-center items-center z-[100]"
    role="button"
    tabindex="-1"
    on:click|self={onClose}
    on:keydown|self={(e) => e.key === "Escape" && onClose()}
  >
    <div class="bg-slate-800 border border-slate-700 rounded-xl w-[90%] max-w-[500px] max-h-[90vh] flex flex-col overflow-hidden">
      <div class="flex justify-between items-center px-6 py-4 border-b border-slate-700">
        <h3 class="m-0 text-sky-400">Delete Exercise: {deletingExercise.name || "Untitled"}</h3>
        <button class="bg-transparent border-none text-slate-400 text-xl cursor-pointer" on:click={onClose}>✕</button>
      </div>

      <div class="p-6 overflow-y-auto flex-1">
        {#if isDeleteLoading}
          <p>Checking exercise usage in exams...</p>
        {:else if deleteUsageInfo && deleteUsageInfo.examCount > 0}
          <div class="bg-red-500/15 border border-red-500 rounded-lg p-4 text-red-300">
            <h4 class="m-0 mb-2 text-red-400">⚠️ Warning: Exercise in Use</h4>
            <p>
              This exercise is currently referenced in <strong>{deleteUsageInfo.examCount}</strong> exam(s):
            </p>
            <ul class="my-2 pl-6 text-slate-200">
              {#each deleteUsageInfo.exams as exam}
                <li>
                  <strong>{exam.title}</strong>
                  {#if exam.datum}<span class="text-slate-400 text-[0.85rem] ml-[0.35rem]">({exam.datum})</span>{/if}
                </li>
              {/each}
            </ul>
            <p class="text-[0.85rem] mt-3 text-slate-300">
              Deleting it will permanently remove it from the library and unlink it from these exams.
            </p>
          </div>
        {:else}
          <p>Are you sure you want to delete this exercise from your library?</p>
        {/if}
      </div>

      <div class="flex justify-end gap-4 px-6 py-4 border-t border-slate-700">
        <button class="bg-slate-700 text-white border-none px-5 py-2.5 rounded-md cursor-pointer" on:click={onClose}>Cancel</button>
        <button
          class="bg-red-600 text-white border-none px-5 py-2.5 rounded-md font-semibold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          on:click={onConfirm}
          disabled={isDeleteLoading}
        >
          Delete Anyway
        </button>
      </div>
    </div>
  </div>
{/if}
