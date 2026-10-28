<script lang="ts">
  import type { Snippet } from "svelte";
  import Modal from "./Modal.svelte";
  import Button from "./Button.svelte";

  /**
   * Confirm/cancel prompt. Destructive confirms use `severity="danger"`. `busy` = the action runs (spinner,
   * nothing dismissable); `error` = it failed, shown inline while the dialog stays open.
   */
  interface Props {
    open?: boolean;
    title: string;
    /** Plain body text; `children` adds to it or replaces it. */
    message?: string;
    confirmText: string;
    cancelText: string;
    severity?: "primary" | "danger";
    busy?: boolean;
    error?: string;
    confirmDisabled?: boolean;
    /** `alertdialog` for destructive confirms; the legacy shim passes `dialog`. */
    role?: "dialog" | "alertdialog";
    onConfirm?: (() => void) | undefined;
    onCancel?: (() => void) | undefined;
    /** Extra controls under the message, e.g. an option for the confirmed action. */
    children?: Snippet;
  }

  let {
    open = false,
    title,
    message = "",
    confirmText,
    cancelText,
    severity = "primary",
    busy = false,
    error = "",
    confirmDisabled = false,
    role = "alertdialog",
    onConfirm = undefined,
    onCancel = undefined,
    children,
  }: Props = $props();
</script>

<Modal {open} size="small" {title} {role} {error} closeOnEscape={!busy} onClose={busy ? undefined : () => onCancel?.()}>
  {#if message}<p class="m-0 leading-normal text-muted">{message}</p>{/if}
  {#if children}<div class={message ? "mt-4" : ""}>{@render children()}</div>{/if}

  {#snippet footer()}
    <Button variant="text" severity="secondary" disabled={busy} onClick={() => onCancel?.()}>{cancelText}</Button>
    <Button variant="solid" {severity} loading={busy} disabled={busy || confirmDisabled} onClick={() => onConfirm?.()}>
      {confirmText}
    </Button>
  {/snippet}
</Modal>
