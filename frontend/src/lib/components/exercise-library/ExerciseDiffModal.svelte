<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import LatexEditor from "$lib/components/LatexEditor.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import { computeSideBySideDiff, buildAlignedDiffDecorations } from "$lib/latex/diff";
  import { getDiffSelectLabel } from "./ExerciseDiffModal";
  import "./ExerciseDiffModal.css";

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
    class="exercise-diff-modal-backdrop"
    role="button"
    tabindex="-1"
    on:click|self={onRequestClose}
    on:keydown|self={(e) => e.key === "Escape" && onRequestClose()}
  >
    <div class="exercise-diff-modal-content exercise-diff-modal-large-modal">
      <div class="exercise-diff-modal-header">
        <h3>Exercise LaTeX Code Diff Comparison</h3>
        <button class="exercise-diff-modal-close-btn" on:click={onRequestClose}>✕</button>
      </div>

      <div class="exercise-diff-modal-body">
        <div class="exercise-diff-modal-diff-selectors">
          <div class="exercise-diff-modal-diff-select-group">
            <label for="diffLeftSelect">Base / Left Version:</label>
            <select id="diffLeftSelect" bind:value={diffLeftId}>
              {#each activeDiffGroupExercises as ex}
                <option value={ex.id}>
                  {getDiffSelectLabel(ex)}
                </option>
              {/each}
            </select>
          </div>

          <div class="exercise-diff-modal-diff-select-group">
            <label for="diffRightSelect">Compared / Right Version:</label>
            <select id="diffRightSelect" bind:value={diffRightId}>
              {#each activeDiffGroupExercises as ex}
                <option value={ex.id}>
                  {getDiffSelectLabel(ex)}
                </option>
              {/each}
            </select>
          </div>
        </div>

        <div class="exercise-diff-modal-diff-panes">
          <div class="exercise-diff-modal-diff-pane">
            <div class="exercise-diff-modal-diff-pane-header">
              <h4>Left: {diffLeftEx?.name || "Original"} (v{diffLeftEx?.version || 1})</h4>
              <div class="exercise-diff-modal-pane-controls">
                {#if isDiffLeftDirty}
                  <button
                    type="button"
                    class="exercise-diff-modal-save-pane-btn"
                    on:click={onSaveLeft}
                    disabled={isSavingDiffLeft}
                  >
                    {isSavingDiffLeft ? "Saving..." : "Save Left"}
                  </button>
                {/if}
              </div>
            </div>

            <div class="exercise-diff-modal-diff-editor-wrapper">
              <LatexEditor
                bind:this={diffLeftEditor}
                bind:value={diffLeftLatex}
                rows={16}
                diffDecorations={leftDiffDecorations}
                on:scroll={handleDiffLeftScroll}
              />
            </div>
          </div>

          <div class="exercise-diff-modal-diff-pane">
            <div class="exercise-diff-modal-diff-pane-header">
              <h4>Right: {diffRightEx?.name || "Compared"} (v{diffRightEx?.version || 1})</h4>
              <div class="exercise-diff-modal-pane-controls">
                {#if isDiffRightDirty}
                  <button
                    type="button"
                    class="exercise-diff-modal-save-pane-btn"
                    on:click={onSaveRight}
                    disabled={isSavingDiffRight}
                  >
                    {isSavingDiffRight ? "Saving..." : "Save Right"}
                  </button>
                {/if}
              </div>
            </div>

            <div class="exercise-diff-modal-diff-editor-wrapper">
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

      <div class="exercise-diff-modal-footer">
        <button class="exercise-diff-modal-cancel-btn" on:click={onRequestClose}>Close</button>
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
