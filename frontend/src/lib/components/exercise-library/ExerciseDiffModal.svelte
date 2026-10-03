<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import type { ExerciseRecord } from "$lib/db/schema";
  import LatexEditor from "$lib/components/LatexEditor.svelte";
  import { computeSideBySideDiff, buildAlignedDiffDecorations } from "$lib/latex/diff";
  import { getDiffSelectLabel } from "./ExerciseDiffModal";
  import { t } from "$lib/i18n";
  import { Alert, ConfirmDialog, Modal, Button, Select } from "$lib/components/ui";

  interface Props {
    isOpen?: boolean;
    /** Failure or validation message from the page, shown inline. */
    error?: string;
    activeDiffGroupExercises?: ExerciseRecord[];
    diffLeftId?: string;
    diffRightId?: string;
    diffLeftEx?: ExerciseRecord | null | undefined;
    diffRightEx?: ExerciseRecord | null | undefined;
    diffLeftLatex?: string;
    diffRightLatex?: string;
    isDiffLeftDirty?: boolean;
    isDiffRightDirty?: boolean;
    isSavingDiffLeft?: boolean;
    isSavingDiffRight?: boolean;
    onSaveLeft: () => void;
    onSaveRight: () => void;
    onRequestClose: () => void;
    showConfirmClose?: boolean;
    onForceCloseConfirm: () => void;
    onCancelConfirmClose: () => void;
  }

  let {
    isOpen = false,
    error = "",
    activeDiffGroupExercises = [],
    diffLeftId = $bindable(""),
    diffRightId = $bindable(""),
    diffLeftEx = null,
    diffRightEx = null,
    diffLeftLatex = $bindable(""),
    diffRightLatex = $bindable(""),
    isDiffLeftDirty = false,
    isDiffRightDirty = false,
    isSavingDiffLeft = false,
    isSavingDiffRight = false,
    onSaveLeft,
    onSaveRight,
    onRequestClose,
    showConfirmClose = false,
    onForceCloseConfirm,
    onCancelConfirmClose
  }: Props = $props();

  let diffLeftEditor: ReturnType<typeof LatexEditor> | undefined = $state();
  let diffRightEditor: ReturnType<typeof LatexEditor> | undefined = $state();
  let isSyncingDiffScroll = false;

  let sideBySideDiff = $derived(computeSideBySideDiff(diffLeftLatex, diffRightLatex));

  // Wrapped line heights fed to the alignment; re-read on every CodeMirror re-measure,
  // since a one-off read at mount only sees estimated heights.
  let leftLineHeights = $state.raw(new Map<number, number>());
  let rightLineHeights = $state.raw(new Map<number, number>());
  let remeasureFrame: number | null = null;

  function sameHeights(a: Map<number, number>, b: Map<number, number>): boolean {
    if (a.size !== b.size) return false;
    for (const [line, h] of a) {
      const other = b.get(line);
      if (other === undefined || Math.abs(other - h) >= 0.5) return false;
    }
    return true;
  }

  function remeasure() {
    remeasureFrame = null;
    const left = diffLeftEditor?.getLineHeights() ?? new Map<number, number>();
    const right = diffRightEditor?.getLineHeights() ?? new Map<number, number>();
    // Only reassign on a real change, so applying the resulting paddings
    // (which triggers another geometry update) settles instead of looping.
    if (!sameHeights(left, leftLineHeights)) leftLineHeights = left;
    if (!sameHeights(right, rightLineHeights)) rightLineHeights = right;
  }

  function scheduleRemeasure() {
    if (remeasureFrame !== null) return;
    remeasureFrame = requestAnimationFrame(remeasure);
  }

  $effect.pre(() => {
    const open = isOpen;
    const left = diffLeftEditor;
    const right = diffRightEditor;
    const leftLatex = diffLeftLatex;
    const rightLatex = diffRightLatex;
    if (open || left || right || leftLatex || rightLatex) {
      untrack(() => scheduleRemeasure());
    }
  });

  onDestroy(() => {
    if (remeasureFrame !== null) cancelAnimationFrame(remeasureFrame);
  });

  let alignedDiffDecorations = $derived(buildAlignedDiffDecorations(
    sideBySideDiff,
    leftLineHeights,
    rightLineHeights,
  ));

  let leftDiffDecorations = $derived(alignedDiffDecorations?.leftConfig ?? null);
  let rightDiffDecorations = $derived(alignedDiffDecorations?.rightConfig ?? null);

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

<Modal open={isOpen} size="full" title={$t("exercises.diffModal.title")} onClose={onRequestClose}>
  {#if error}
    <div class="mb-3"><Alert severity="danger">{error}</Alert></div>
  {/if}
  <div class="mb-6 flex flex-col gap-4 rounded-md bg-surface-inset p-4 @xl:flex-row @xl:gap-6">
    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
      <label for="diffLeftSelect" class="text-sm text-muted">{$t("exercises.diffModal.baseLabel")}</label>
      <Select id="diffLeftSelect" bind:value={diffLeftId}>
        {#each activeDiffGroupExercises as ex}
          <option value={ex.id}>
            {getDiffSelectLabel(ex)}
          </option>
        {/each}
      </Select>
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
      <label for="diffRightSelect" class="text-sm text-muted">{$t("exercises.diffModal.comparedLabel")}</label>
      <Select id="diffRightSelect" bind:value={diffRightId}>
        {#each activeDiffGroupExercises as ex}
          <option value={ex.id}>
            {getDiffSelectLabel(ex)}
          </option>
        {/each}
      </Select>
    </div>
  </div>

  <div class="mb-4 grid grid-cols-1 gap-4 @3xl:grid-cols-2">
    <div class="min-w-0">
      <div class="mb-2 flex min-h-8 items-center justify-between gap-2">
        <h3 class="m-0 min-w-0 truncate text-sm font-semibold text-content">{$t("exercises.diffModal.leftHeading", { name: diffLeftEx?.name || $t("exercises.diffModal.leftOriginalFallback"), version: diffLeftEx?.version || 1 })}</h3>
        <div class="flex shrink-0 items-center gap-2">
          {#if isDiffLeftDirty}
            <Button size="sm" onClick={onSaveLeft} disabled={isSavingDiffLeft}>
              {isSavingDiffLeft ? $t("exercises.diffModal.saving") : $t("exercises.diffModal.saveLeft")}
            </Button>
          {/if}
        </div>
      </div>

      <div class="h-112 overflow-hidden rounded-md">
        <LatexEditor
          bind:this={diffLeftEditor}
          bind:value={diffLeftLatex}
          rows={16}
          diffDecorations={leftDiffDecorations}
          onGeometryChange={scheduleRemeasure}
          onScroll={handleDiffLeftScroll}
        />
      </div>
    </div>

    <div class="min-w-0">
      <div class="mb-2 flex min-h-8 items-center justify-between gap-2">
        <h3 class="m-0 min-w-0 truncate text-sm font-semibold text-content">{$t("exercises.diffModal.rightHeading", { name: diffRightEx?.name || $t("exercises.diffModal.rightComparedFallback"), version: diffRightEx?.version || 1 })}</h3>
        <div class="flex shrink-0 items-center gap-2">
          {#if isDiffRightDirty}
            <Button size="sm" onClick={onSaveRight} disabled={isSavingDiffRight}>
              {isSavingDiffRight ? $t("exercises.diffModal.saving") : $t("exercises.diffModal.saveRight")}
            </Button>
          {/if}
        </div>
      </div>

      <div class="h-112 overflow-hidden rounded-md">
        <LatexEditor
          bind:this={diffRightEditor}
          bind:value={diffRightLatex}
          rows={16}
          diffDecorations={rightDiffDecorations}
          onGeometryChange={scheduleRemeasure}
          onScroll={handleDiffRightScroll}
        />
      </div>
    </div>
  </div>

  {#snippet footer()}
    <Button variant="outlined" severity="secondary" onClick={onRequestClose}>{$t("common.close")}</Button>
  {/snippet}
</Modal>

<ConfirmDialog
  open={showConfirmClose}
  title={$t("exercises.diffModal.discardTitle")}
  message={$t("exercises.diffModal.discardMessage")}
  confirmText={$t("exercises.confirmDiscard.confirmText")}
  cancelText={$t("exercises.confirmDiscard.cancelText")}
  severity="danger"
  role="dialog"
  onConfirm={onForceCloseConfirm}
  onCancel={onCancelConfirmClose}
/>
