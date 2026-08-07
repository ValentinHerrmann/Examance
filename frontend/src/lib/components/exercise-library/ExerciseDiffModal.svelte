<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import LatexEditor from "$lib/components/LatexEditor.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import { computeSideBySideDiff, buildAlignedDiffDecorations } from "$lib/latex/diff";

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

  function getDiffSelectLabel(ex: ExerciseRecord): string {
    const name = ex.name || "Untitled";
    const v = ex.version || 1;
    const variantStr = ex.variantKey ? `, Variant: ${ex.variantKey}` : "";
    return `${name} (v${v}${variantStr})`;
  }

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
    class="modal-backdrop"
    role="button"
    tabindex="-1"
    on:click|self={onRequestClose}
    on:keydown|self={(e) => e.key === "Escape" && onRequestClose()}
  >
    <div class="modal-content large-modal">
      <div class="modal-header">
        <h3>Exercise LaTeX Code Diff Comparison</h3>
        <button class="close-btn" on:click={onRequestClose}>✕</button>
      </div>

      <div class="modal-body">
        <div class="diff-selectors">
          <div class="diff-select-group">
            <label for="diffLeftSelect">Base / Left Version:</label>
            <select id="diffLeftSelect" bind:value={diffLeftId}>
              {#each activeDiffGroupExercises as ex}
                <option value={ex.id}>
                  {getDiffSelectLabel(ex)}
                </option>
              {/each}
            </select>
          </div>

          <div class="diff-select-group">
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

        <div class="diff-panes">
          <div class="diff-pane">
            <div class="diff-pane-header">
              <h4>Left: {diffLeftEx?.name || "Original"} (v{diffLeftEx?.version || 1})</h4>
              <div class="pane-controls">
                {#if isDiffLeftDirty}
                  <button
                    type="button"
                    class="save-pane-btn"
                    on:click={onSaveLeft}
                    disabled={isSavingDiffLeft}
                  >
                    {isSavingDiffLeft ? "Saving..." : "Save Left"}
                  </button>
                {/if}
              </div>
            </div>

            <div class="diff-editor-wrapper">
              <LatexEditor
                bind:this={diffLeftEditor}
                bind:value={diffLeftLatex}
                rows={16}
                diffDecorations={leftDiffDecorations}
                on:scroll={handleDiffLeftScroll}
              />
            </div>
          </div>

          <div class="diff-pane">
            <div class="diff-pane-header">
              <h4>Right: {diffRightEx?.name || "Compared"} (v{diffRightEx?.version || 1})</h4>
              <div class="pane-controls">
                {#if isDiffRightDirty}
                  <button
                    type="button"
                    class="save-pane-btn"
                    on:click={onSaveRight}
                    disabled={isSavingDiffRight}
                  >
                    {isSavingDiffRight ? "Saving..." : "Save Right"}
                  </button>
                {/if}
              </div>
            </div>

            <div class="diff-editor-wrapper">
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

      <div class="modal-footer">
        <button class="cancel-btn" on:click={onRequestClose}>Close</button>
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

  .large-modal {
    max-width: 1400px;
    max-height: 95vh;
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

  .diff-selectors {
    display: flex;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
    background: #0f172a;
    padding: 1rem;
    border-radius: 8px;
  }

  .diff-select-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    flex: 1;
  }

  .diff-select-group select {
    padding: 0.5rem;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 6px;
    color: white;
  }

  .diff-panes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .diff-pane-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .pane-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .save-pane-btn {
    background: #10b981;
    color: white;
    border: none;
    padding: 0.25rem 0.6rem;
    font-size: 0.75rem;
    font-weight: 600;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .save-pane-btn:hover:not(:disabled) {
    background: #059669;
  }

  .save-pane-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .diff-editor-wrapper {
    max-height: 450px;
    height: 450px;
    border-radius: 8px;
    overflow: hidden;
  }

  .diff-pane h4 {
    margin: 0;
    color: #38bdf8;
    font-size: 0.9rem;
  }
</style>
