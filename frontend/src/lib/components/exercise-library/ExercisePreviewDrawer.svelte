<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import { parseExerciseScore } from "$lib/latex/scoreParser";
  import LatexViewer from "$lib/components/LatexViewer.svelte";

  export let previewModalEx: ExerciseRecord;
  export let isModalSelected: boolean;
  export let onClose: () => void;
  export let onToggleSelection: (id: string) => void;
  export let onQuickEdit: (ex: ExerciseRecord) => void;

  $: modalScore = parseExerciseScore(previewModalEx.latexBody || "") || previewModalEx.maxPoints || 0;

  const selectBtnBase =
    "cursor-pointer rounded-md border-0 bg-sky-600 px-5 py-2 text-[0.9rem] font-semibold text-white transition-colors duration-150 ease-[ease] hover:bg-sky-700";
  const selectBtnSelected =
    "cursor-pointer rounded-md border-0 bg-green-600 px-5 py-2 text-[0.9rem] font-semibold text-white transition-colors duration-150 ease-[ease] hover:bg-green-700";
</script>

<div
  class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-[3px]"
  role="button"
  tabindex="0"
  on:click={onClose}
  on:keydown={(e) => e.key === "Escape" && onClose()}
>
  <div
    class="flex max-h-[85vh] w-full max-w-[700px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-[0_20px_25px_-5px_rgba(0,0,0,0.5)]"
    role="dialog"
    aria-modal="true"
    on:click|stopPropagation
  >
    <div class="flex items-start justify-between border-b border-slate-700 bg-slate-900 px-6 py-5">
      <div>
        <div class="mb-[0.4rem] flex items-center gap-2">
          <h3 class="m-0 text-[1.15rem] text-slate-50">{previewModalEx.name}</h3>
          {#if previewModalEx.variantKey && previewModalEx.variantKey !== "_General"}
            <span class="rounded bg-slate-700 px-[0.4rem] py-[0.1rem] text-xs text-slate-300">{previewModalEx.variantKey}</span>
          {/if}
        </div>
        <div class="flex flex-wrap items-center gap-[0.4rem]">
          {#if previewModalEx.topicTag}
            <span class="rounded bg-slate-700 px-[0.4rem] py-[0.1rem] text-xs text-slate-300">{previewModalEx.topicTag}</span>
          {/if}
          <span class="rounded bg-sky-700 px-2 py-[0.15rem] text-xs font-semibold text-sky-100">{modalScore} Pkt</span>
          <span class="rounded bg-slate-700 px-2 py-[0.15rem] text-xs text-slate-300"
            >Version {previewModalEx.version}</span
          >
          {#if previewModalEx.questionType}
            <span class="rounded bg-slate-600 px-2 py-[0.15rem] text-xs uppercase text-slate-100"
              >{previewModalEx.questionType}</span
            >
          {/if}
        </div>
      </div>
      <button class="cursor-pointer rounded border-0 bg-transparent px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-700 hover:text-white" on:click={onClose}>✕</button>
    </div>

    <div class="flex-1 overflow-y-auto px-6 py-5">
      <div class="flex flex-col gap-[0.4rem]">
        <div class="text-[0.78rem] font-semibold uppercase tracking-[0.05em] text-slate-400">LaTeX Source Code</div>
        <LatexViewer code={previewModalEx.latexBody || "\\begin{Aufgabe}{}\n\\end{Aufgabe}"} maxHeight="350px" />
      </div>
    </div>

    <div class="flex items-center justify-between border-t border-slate-700 bg-slate-900 px-6 py-4">
      <button
        type="button"
        class={isModalSelected ? selectBtnSelected : selectBtnBase}
        on:click={() => onToggleSelection(previewModalEx.id)}
      >
        {isModalSelected
          ? "✓ Selected in Exam (Click to Remove)"
          : "+ Select for Exam"}
      </button>
      <button
        type="button"
        class="cursor-pointer rounded-md border border-slate-600 bg-slate-700 px-4 py-2 text-[0.85rem] font-semibold text-sky-400 hover:bg-slate-600"
        on:click={() => onQuickEdit(previewModalEx)}
      >
        ✏️ Quick Edit
      </button>
      <button
        type="button"
        class="cursor-pointer rounded-md border-0 bg-slate-700 px-4 py-2 text-[0.85rem] text-slate-300 hover:bg-slate-600 hover:text-white"
        on:click={onClose}
      >
        Close
      </button>
    </div>
  </div>
</div>

