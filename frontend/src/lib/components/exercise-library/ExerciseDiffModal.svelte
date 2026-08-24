<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import LatexEditor from "$lib/components/LatexEditor.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import { computeSideBySideDiff, buildAlignedDiffDecorations } from "$lib/latex/diff";
  import { getDiffSelectLabel } from "./ExerciseDiffModal";
  import { t } from "$lib/i18n";
  import { Modal, Button, Select } from "$lib/components/ui";

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

<Modal open={isOpen} size="xl" title={$t("exercises.diffModal.title")} onClose={onRequestClose}>
  <div class="mb-6 flex flex-col gap-4 rounded-lg bg-surface-inset p-4 sm:flex-row sm:gap-6">
    <div class="flex flex-1 flex-col gap-1.5">
      <label for="diffLeftSelect" class="text-sm text-muted">{$t("exercises.diffModal.baseLabel")}</label>
      <Select id="diffLeftSelect" bind:value={diffLeftId}>
        {#each activeDiffGroupExercises as ex}
          <option value={ex.id}>
            {getDiffSelectLabel(ex)}
          </option>
        {/each}
      </Select>
    </div>

    <div class="flex flex-1 flex-col gap-1.5">
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

  <div class="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
    <div>
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 class="m-0 text-[0.9rem] text-accent">{$t("exercises.diffModal.leftHeading", { name: diffLeftEx?.name || $t("exercises.diffModal.leftOriginalFallback"), version: diffLeftEx?.version || 1 })}</h4>
        <div class="flex items-center gap-2">
          {#if isDiffLeftDirty}
            <Button variant="primary" size="sm" onClick={onSaveLeft} disabled={isSavingDiffLeft}>
              {isSavingDiffLeft ? $t("exercises.diffModal.saving") : $t("exercises.diffModal.saveLeft")}
            </Button>
          {/if}
        </div>
      </div>

      <div class="h-[450px] max-h-[450px] overflow-hidden rounded-lg">
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
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 class="m-0 text-[0.9rem] text-accent">{$t("exercises.diffModal.rightHeading", { name: diffRightEx?.name || $t("exercises.diffModal.rightComparedFallback"), version: diffRightEx?.version || 1 })}</h4>
        <div class="flex items-center gap-2">
          {#if isDiffRightDirty}
            <Button variant="primary" size="sm" onClick={onSaveRight} disabled={isSavingDiffRight}>
              {isSavingDiffRight ? $t("exercises.diffModal.saving") : $t("exercises.diffModal.saveRight")}
            </Button>
          {/if}
        </div>
      </div>

      <div class="h-[450px] max-h-[450px] overflow-hidden rounded-lg">
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

  <svelte:fragment slot="footer">
    <Button variant="secondary" onClick={onRequestClose}>{$t("common.close")}</Button>
  </svelte:fragment>
</Modal>

<ConfirmDialog
  isOpen={showConfirmClose}
  title={$t("exercises.diffModal.discardTitle")}
  message={$t("exercises.diffModal.discardMessage")}
  confirmText={$t("exercises.confirmDiscard.confirmText")}
  cancelText={$t("exercises.confirmDiscard.cancelText")}
  on:confirm={onForceCloseConfirm}
  on:cancel={onCancelConfirmClose}
/>
