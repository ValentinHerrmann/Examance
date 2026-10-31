<script lang="ts">
  import type { ExerciseRecord } from "#lib/db/schema";
  import LatexEditor from "#lib/components/LatexEditor.svelte";
  import { t } from "#lib/i18n";
  import InfoTip from "#lib/components/help/InfoTip.svelte";
  import { ConfirmDialog, Modal, Button, Field, controlClass } from "#lib/components/ui";

  interface Props {
    isOpen?: boolean;
    /** Failure or validation message from the page, shown inline. */
    error?: string;
    variantBaseEx?: ExerciseRecord | null;
    variantKey?: string;
    variantLatexBody?: string;
    showConfirmClose?: boolean;
    onRequestClose: () => void;
    onSave: () => void;
    onForceCloseConfirm: () => void;
    onCancelConfirmClose: () => void;
  }

  let {
    isOpen = false,
    error = "",
    variantBaseEx = null,
    variantKey = $bindable(""),
    variantLatexBody = $bindable(""),
    showConfirmClose = false,
    onRequestClose,
    onSave,
    onForceCloseConfirm,
    onCancelConfirmClose
  }: Props = $props();
</script>

<Modal open={isOpen && !!variantBaseEx} size="large" title={$t("exercises.variantModal.title")} onClose={onRequestClose} {error}>
  {#if variantBaseEx}
    <p class="m-0 mb-4 text-sm text-muted">
      {$t("exercises.variantModal.hint")}
    </p>

    <div class="-mx-4 mb-4 bg-highlight px-4 py-2 text-sm text-accent">
      {$t("exercises.variantModal.groupContext", { name: variantBaseEx.name, topic: variantBaseEx.topicTag || '_General', gradeSuffix: variantBaseEx.grade ? $t("exercises.variantModal.groupContextGradeSuffix", { grade: variantBaseEx.grade }) : '' })}
    </div>

    <!-- Own label: `Field`'s is plain text and this one carries the help tip. -->
    <Field forId="variantKey" class="mb-4">
      {#snippet children({ id })}
        <label for={id} class="flex items-center gap-1.5 text-sm font-medium text-content">
          {$t("exercises.variantModal.keyLabel")}
          <InfoTip text={$t("help.tips.variantKey")} topic="exercises" />
        </label>
        <input {id} type="text" bind:value={variantKey} placeholder={$t("exercises.variantModal.keyPlaceholder")} required class={controlClass} />
      {/snippet}
    </Field>

    <Field label={$t("exercises.variantModal.latexBodyLabel")} forId="variantBody" class="mb-4">
      <LatexEditor bind:value={variantLatexBody} rows={8} />
    </Field>
  {/if}

  {#snippet footer()}
    <Button variant="outlined" severity="secondary" onClick={onRequestClose}>{$t("common.cancel")}</Button>
    <Button onClick={onSave}>{$t("exercises.variantModal.saveButton")}</Button>
  {/snippet}
</Modal>

<ConfirmDialog
  open={showConfirmClose}
  title={$t("exercises.variantModal.discardTitle")}
  message={$t("exercises.variantModal.discardMessage")}
  confirmText={$t("exercises.confirmDiscard.confirmText")}
  cancelText={$t("exercises.confirmDiscard.cancelText")}
  severity="danger"
  role="dialog"
  onConfirm={onForceCloseConfirm}
  onCancel={onCancelConfirmClose}
/>
