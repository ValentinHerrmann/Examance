<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import LatexEditor from "$lib/components/LatexEditor.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import { t } from "$lib/i18n";
  import { Modal, Button, controlClass } from "$lib/components/ui";

  export let isOpen = false;
  export let variantBaseEx: ExerciseRecord | null = null;
  export let variantKey = "";
  export let variantLatexBody = "";
  export let showConfirmClose = false;
  export let onRequestClose: () => void;
  export let onSave: () => void;
  export let onForceCloseConfirm: () => void;
  export let onCancelConfirmClose: () => void;
</script>

<Modal open={isOpen && !!variantBaseEx} size="md" title={$t("exercises.variantModal.title")} onClose={onRequestClose}>
  {#if variantBaseEx}
    <p class="m-0 mb-4 text-sm text-muted">
      {$t("exercises.variantModal.hint")}
    </p>

    <div class="-mx-4 mb-4 bg-sky-600/20 px-6 py-2 text-[0.85rem] text-sky-300 sm:-mx-5">
      {$t("exercises.variantModal.groupContext", { name: variantBaseEx.name, topic: variantBaseEx.topicTag || '_General', gradeSuffix: variantBaseEx.grade ? $t("exercises.variantModal.groupContextGradeSuffix", { grade: variantBaseEx.grade }) : '' })}
    </div>

    <div class="mb-4 flex flex-col gap-[0.375rem]">
      <label for="variantKey" class="text-sm text-muted">{$t("exercises.variantModal.keyLabel")}</label>
      <input
        id="variantKey"
        type="text"
        bind:value={variantKey}
        placeholder={$t("exercises.variantModal.keyPlaceholder")}
        required
        class={controlClass}
      />
    </div>

    <div class="mb-4 flex flex-col gap-[0.375rem]">
      <label for="variantBody" class="text-sm text-muted"
        >{$t("exercises.variantModal.latexBodyLabel")}</label
      >
      <LatexEditor bind:value={variantLatexBody} rows={8} />
    </div>
  {/if}

  <svelte:fragment slot="footer">
    <Button variant="secondary" onClick={onRequestClose}>{$t("common.cancel")}</Button>
    <Button variant="primary" onClick={onSave}>{$t("exercises.variantModal.saveButton")}</Button>
  </svelte:fragment>
</Modal>

<ConfirmDialog
  isOpen={showConfirmClose}
  title={$t("exercises.variantModal.discardTitle")}
  message={$t("exercises.variantModal.discardMessage")}
  confirmText={$t("exercises.confirmDiscard.confirmText")}
  cancelText={$t("exercises.confirmDiscard.cancelText")}
  on:confirm={onForceCloseConfirm}
  on:cancel={onCancelConfirmClose}
/>
