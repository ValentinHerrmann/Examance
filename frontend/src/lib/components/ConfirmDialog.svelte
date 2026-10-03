<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { t } from "$lib/i18n";
  import { ConfirmDialog } from "$lib/components/ui";

  /**
   * Legacy wrapper kept so existing callers (`isOpen`, `on:confirm`,
   * `on:cancel`) keep working. New code uses `ui/ConfirmDialog` directly.
   */
  export let isOpen = false;
  // `undefined` rather than a literal keeps the fallback reactive, so an
  // unspecified prop still follows the selected language.
  export let title: string | undefined = undefined;
  export let message: string | undefined = undefined;
  export let confirmText: string | undefined = undefined;
  export let cancelText: string | undefined = undefined;

  $: resolvedTitle = title ?? $t("editor.confirmDialog.title");
  $: resolvedMessage = message ?? $t("editor.confirmDialog.message");
  $: resolvedConfirmText = confirmText ?? $t("editor.confirmDialog.confirmText");
  $: resolvedCancelText = cancelText ?? $t("editor.confirmDialog.cancelText");

  const dispatch = createEventDispatcher<{ confirm: void; cancel: void }>();
</script>

<ConfirmDialog
  open={isOpen}
  title={resolvedTitle}
  message={resolvedMessage}
  confirmText={resolvedConfirmText}
  cancelText={resolvedCancelText}
  severity="danger"
  role="dialog"
  onConfirm={() => dispatch("confirm")}
  onCancel={() => dispatch("cancel")}
/>
