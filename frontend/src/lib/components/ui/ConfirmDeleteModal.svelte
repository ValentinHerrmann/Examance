<script lang="ts">
  import Button from "./Button.svelte";
  import Modal from "./Modal.svelte";

  /**
   * Shared delete-confirmation chrome (Artemis dialog): a small dialog with a
   * cancel / danger-confirm footer and an optional loading state. The default
   * slot holds the confirmation text and any impact warning (e.g. where the
   * record is still used); callers decide the content, this owns the chrome.
   */
  export let open = false;
  export let title: string;
  export let isDeleteLoading = false;
  export let confirmLabel: string;
  export let cancelLabel: string;
  export let onConfirm: () => void;
  export let onClose: () => void;
</script>

<Modal {open} size="small" {title} {onClose}>
  <slot></slot>

  <svelte:fragment slot="footer">
    <Button variant="outlined" severity="secondary" onClick={onClose}>{cancelLabel}</Button>
    <Button severity="danger" onClick={onConfirm} disabled={isDeleteLoading}>{confirmLabel}</Button>
  </svelte:fragment>
</Modal>
