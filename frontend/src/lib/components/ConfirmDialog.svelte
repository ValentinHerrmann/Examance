<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { t } from "$lib/i18n";
  import { Modal, Button } from "$lib/components/ui";

  export let isOpen = false;
  // Defaults come from the catalog, so an unspecified prop still follows the
  // selected language. `undefined` rather than a literal keeps the fallback
  // reactive instead of freezing the language at component creation.
  export let title: string | undefined = undefined;
  export let message: string | undefined = undefined;
  export let confirmText: string | undefined = undefined;
  export let cancelText: string | undefined = undefined;

  $: resolvedTitle = title ?? $t("editor.confirmDialog.title");
  $: resolvedMessage = message ?? $t("editor.confirmDialog.message");
  $: resolvedConfirmText = confirmText ?? $t("editor.confirmDialog.confirmText");
  $: resolvedCancelText = cancelText ?? $t("editor.confirmDialog.cancelText");

  const dispatch = createEventDispatcher<{
    confirm: void;
    cancel: void;
  }>();

  function handleConfirm() {
    dispatch("confirm");
  }

  function handleCancel() {
    dispatch("cancel");
  }
</script>

<Modal open={isOpen} size="sm" title={`⚠️ ${resolvedTitle}`} onClose={handleCancel}>
  <p class="m-0 text-[0.95rem] leading-[1.5] text-muted">{resolvedMessage}</p>

  <svelte:fragment slot="footer">
    <Button variant="secondary" onClick={handleCancel}>{resolvedCancelText}</Button>
    <Button variant="danger" onClick={handleConfirm}>{resolvedConfirmText}</Button>
  </svelte:fragment>
</Modal>
