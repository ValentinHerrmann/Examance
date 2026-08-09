<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import LatexEditor from "$lib/components/LatexEditor.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import { computeSideBySideDiff, buildAlignedDiffDecorations } from "$lib/latex/diff";
  import { getDiffSelectLabel } from "./ExerciseDiffModal";

  export let isOpen = false;
  export let activeDiffGroupExercises: ExerciseRecord[] = [];
  export let diffLeftId = "";
  export let diffRightId = "";
  export let diffLeftEx: ExerciseRecord | null | undefined = null;
  export let diffRightEx: ExerciseRecord | null | undefined = null;
  export let diffLeftLatex = "";
  export let diffRightLatex = "";
  export let isDiffLeftDirty = false;
  export let isDiffRightDirty = false;
  export let isSavingDiffLeft = false;
  export let isSavingDiffRight = false;
  export let onSaveLeft: () => void;
  export let onSaveRight: () => void;
  export let onRequestClose: () => void;
  export let showConfirmClose = false;
  export let onForceCloseConfirm: () => void;
  export let onCancelConfirmClose: () => void;

  let diffLeftEditor: LatexEditor | undefined;
  let diffRightEditor: LatexEditor | undefined;
  let isSyncingDiffScroll = false;

  $: sideBySideDiff = computeSideBySideDiff(diffLeftLatex, diffRightLatex);

  $: leftLineHeights = diffLeftEditor
    ? diffLeftEditor.getLineHeights()
    : new Map<number, number>();

  $: rightLineHeights = diffRightEditor
    ? diffRightEditor.getLineHeights()
    : new Map<number, number>();

  $: alignedDiffDecorations = buildAlignedDiffDecorations(
    sideBySideDiff,
    leftLineHeights,
    rightLineHeights,
  );

  $: leftDiffDecorations = alignedDiffDecorations?.leftConfig ?? null;
  $: rightDiffDecorations = alignedDiffDecorations?.rightConfig ?? null;

  function handleDiffLeftScroll() {
    if (isSyncingDiffScroll || !diffLeftEditor || !diffRightEditor) return;
    isSyncingDiffScroll = true;
    const { scrollTop, scrollLeft } = diffLeftEditor.getScroll();
    diffRightEditor.setScroll(scrollTop, scrollLeft);
    requestAnimationFrame(() => {
      isSyncingDiffScroll = false;
    });
  }

  function handleDiffRightScroll() {
    if (isSyncingDiffScroll || !diffLeftEditor || !diffRightEditor) return;
    isSyncingDiffScroll = true;
    const { scrollTop, scrollLeft } = diffRightEditor.getScroll();
    diffLeftEditor.setScroll(scrollTop, scrollLeft);
    requestAnimationFrame(() => {
      isSyncingDiffScroll = false;
    });
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 w-screen h-screen bg-black/75 flex justify-center items-center z-[100]"
    role="button"
    tabindex="-1"
    on:click|self={onRequestClose}
    on:keydown|self={(e) => e.key === "Escape" && onRequestClose()}
  >
    <div class="bg-slate-800 border border-slate-700 rounded-xl w-[90%] max-w-[1400px] max-h-[95vh] flex flex-col overflow-hidden">
      <div class="flex justify-between items-center px-6 py-4 border-b border-slate-700">
        <h3 class="m-0 text-sky-400">Exercise LaTeX Code Diff Comparison</h3>
        <button class="bg-transparent border-none text-slate-400 text-xl cursor-pointer" on:click={onRequestClose}>✕</button>
      </div>

      <div class="p-6 overflow-y-auto flex-1">
        <div class="flex gap-6 mb-6 bg-slate-900 p-4 rounded-lg">
          <div class="flex flex-col gap-1.5 flex-1">
            <label for="diffLeftSelect" class="text-sm text-slate-300">Base / Left Version:</label>
            <select id="diffLeftSelect" bind:value={diffLeftId} class="p-2 bg-slate-800 border border-slate-700 rounded-md text-white">
              {#each activeDiffGroupExercises as ex}
                <option value={ex.id}>
                  {getDiffSelectLabel(ex)}
                </option>
              {/each}
            </select>
          </div>

          <div class="flex flex-col gap-1.5 flex-1">
            <label for="diffRightSelect" class="text-sm text-slate-300">Compared / Right Version:</label>
            <select id="diffRightSelect" bind:value={diffRightId} class="p-2 bg-slate-800 border border-slate-700 rounded-md text-white">
              {#each activeDiffGroupExercises as ex}
                <option value={ex.id}>
                  {getDiffSelectLabel(ex)}
                </option>
              {/each}
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h4 class="m-0 text-sky-400 text-[0.9rem]">Left: {diffLeftEx?.name || "Original"} (v{diffLeftEx?.version || 1})</h4>
              <div class="flex items-center gap-2">
                {#if isDiffLeftDirty}
                  <button
                    type="button"
                    class="bg-emerald-500 text-white border-none px-[0.6rem] py-1 text-xs font-semibold rounded cursor-pointer transition-colors duration-150 enabled:hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed"
                    on:click={onSaveLeft}
                    disabled={isSavingDiffLeft}
                  >
                    {isSavingDiffLeft ? "Saving..." : "Save Left"}
                  </button>
                {/if}
              </div>
            </div>

            <div class="max-h-[450px] h-[450px] rounded-lg overflow-hidden">
              <LatexEditor
                bind:this={diffLeftEditor}
                bind:value={diffLeftLatex}
                rows={16}
                diffDecorations={leftDiffDecorations}
                on:scroll={handleDiffLeftScroll}
              />
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h4 class="m-0 text-sky-400 text-[0.9rem]">Right: {diffRightEx?.name || "Compared"} (v{diffRightEx?.version || 1})</h4>
              <div class="flex items-center gap-2">
                {#if isDiffRightDirty}
                  <button
                    type="button"
                    class="bg-emerald-500 text-white border-none px-[0.6rem] py-1 text-xs font-semibold rounded cursor-pointer transition-colors duration-150 enabled:hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed"
                    on:click={onSaveRight}
                    disabled={isSavingDiffRight}
                  >
                    {isSavingDiffRight ? "Saving..." : "Save Right"}
                  </button>
                {/if}
              </div>
            </div>

            <div class="max-h-[450px] h-[450px] rounded-lg overflow-hidden">
              <LatexEditor
                bind:this={diffRightEditor}
                bind:value={diffRightLatex}
                rows={16}
                diffDecorations={rightDiffDecorations}
                on:scroll={handleDiffRightScroll}
              />
            </div>
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-4 px-6 py-4 border-t border-slate-700">
        <button class="bg-slate-700 text-white border-none px-5 py-2.5 rounded-md cursor-pointer" on:click={onRequestClose}>Close</button>
      </div>
    </div>
  </div>
{/if}

<ConfirmDialog
  isOpen={showConfirmClose}
  title="Discard Unsaved Diff Changes?"
  message="You have unsaved changes in the LaTeX diff editor. Discarding will lose your changes."
  confirmText="Discard Changes"
  cancelText="Keep Editing"
  on:confirm={onForceCloseConfirm}
  on:cancel={onCancelConfirmClose}
/>
