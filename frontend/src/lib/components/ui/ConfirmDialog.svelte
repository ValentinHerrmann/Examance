<script lang="ts">
  import Modal from "./Modal.svelte";
  import Button from "./Button.svelte";

  /** Confirm/cancel prompt. Destructive confirms use `severity="danger"`. */
  interface Props {
    open?: boolean;
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    severity?: "primary" | "danger";
    busy?: boolean;
    /** `alertdialog` for destructive confirms; the legacy shim passes `dialog`. */
    role?: "dialog" | "alertdialog";
    onConfirm?: (() => void) | undefined;
    onCancel?: (() => void) | undefined;
  }

  let {
    open = false,
    title,
    message,
    confirmText,
    cancelText,
    severity = "primary",
    busy = false,
    role = "alertdialog",
    onConfirm = undefined,
    onCancel = undefined,
  }: Props = $props();
</script>

<Modal {open} size="small" {title} {role} onClose={() => onCancel?.()}>
  <p class="m-0 leading-normal text-muted">{message}</p>

  {#snippet footer()}
  
      <Button variant="text" severity="secondary" onClick={() => onCancel?.()}>{cancelText}</Button>
      <Button variant="solid" {severity} loading={busy} onClick={() => onConfirm?.()}>{confirmText}</Button>
    
  {/snippet}
</Modal>
