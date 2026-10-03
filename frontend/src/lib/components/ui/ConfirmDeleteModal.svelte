<script lang="ts">
  import type { Snippet } from "svelte";
  import Alert from "./Alert.svelte";
  import Button from "./Button.svelte";
  import Modal from "./Modal.svelte";

  /**
   * Shared delete-confirmation chrome: children hold the confirmation text and impact warning.
   * `isDeleteLoading` = usage info loading (confirm disabled); `busy` = delete running (spinner,
   * nothing dismissable); `error` = failed, shown inline, dialog stays open.
   */
  interface Props {
    open?: boolean;
    title: string;
    isDeleteLoading?: boolean;
    busy?: boolean;
    error?: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onClose: () => void;
    children?: Snippet;
  }

  let {
    open = false,
    title,
    isDeleteLoading = false,
    busy = false,
    error = "",
    confirmLabel,
    cancelLabel,
    onConfirm,
    onClose,
    children,
  }: Props = $props();
</script>

<Modal {open} size="small" {title} {onClose}>
  {@render children?.()}
  {#if error}
    <div class="mt-3"><Alert severity="danger">{error}</Alert></div>
  {/if}

  {#snippet footer()}
  
      <Button variant="outlined" severity="secondary" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
      <Button severity="danger" onClick={onConfirm} disabled={isDeleteLoading || busy} loading={busy}>{confirmLabel}</Button>
    
  {/snippet}
</Modal>
