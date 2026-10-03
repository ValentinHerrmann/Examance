<script lang="ts">
  import Alert from "./Alert.svelte";
  import Button from "./Button.svelte";
  import Modal from "./Modal.svelte";

  /**
   * Shared delete-confirmation chrome (Artemis dialog): a small dialog with a
   * cancel / danger-confirm footer and an optional loading state. The default
   * slot holds the confirmation text and any impact warning (e.g. where the
   * record is still used); callers decide the content, this owns the chrome.
   * `isDeleteLoading` = usage info still loading (confirm disabled); `busy` =
   * the delete request is running (confirm spinner, nothing can be dismissed);
   * `error` = it failed — shown inline, the dialog stays open.
   */
  export let open = false;
  export let title: string;
  export let isDeleteLoading = false;
  export let busy = false;
  export let error = "";
  export let confirmLabel: string;
  export let cancelLabel: string;
  export let onConfirm: () => void;
  export let onClose: () => void;
</script>

<Modal {open} size="small" {title} {onClose}>
  <slot></slot>
  {#if error}
    <div class="mt-3"><Alert severity="danger">{error}</Alert></div>
  {/if}

  <svelte:fragment slot="footer">
    <Button variant="outlined" severity="secondary" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
    <Button severity="danger" onClick={onConfirm} disabled={isDeleteLoading || busy} loading={busy}>{confirmLabel}</Button>
  </svelte:fragment>
</Modal>
