<script lang="ts">
  import Modal from "./Modal.svelte";
  import Button from "./Button.svelte";

  /** Confirm/cancel prompt. Destructive confirms use `severity="danger"`. */
  export let open = false;
  export let title: string;
  export let message: string;
  export let confirmText: string;
  export let cancelText: string;
  export let severity: "primary" | "danger" = "primary";
  export let busy = false;
  /** `alertdialog` for destructive confirms; the legacy shim passes `dialog`. */
  export let role: "dialog" | "alertdialog" = "alertdialog";
  export let onConfirm: (() => void) | undefined = undefined;
  export let onCancel: (() => void) | undefined = undefined;
</script>

<Modal {open} size="small" {title} {role} onClose={() => onCancel?.()}>
  <p class="m-0 leading-normal text-muted">{message}</p>

  <svelte:fragment slot="footer">
    <Button variant="text" severity="secondary" onClick={() => onCancel?.()}>{cancelText}</Button>
    <Button variant="solid" {severity} loading={busy} onClick={() => onConfirm?.()}>{confirmText}</Button>
  </svelte:fragment>
</Modal>
