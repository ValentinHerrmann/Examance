<script lang="ts">
  import "./ConfirmDialog.css";
  import { createEventDispatcher } from "svelte";

  export let isOpen = false;
  export let title = "Unsaved Changes";
  export let message = "You have unsaved changes that will be lost. Are you sure you want to exit without saving?";
  export let confirmText = "Discard Changes";
  export let cancelText = "Keep Editing";

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

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === "Escape") {
      handleCancel();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <div
    class="confirm-dialog-backdrop"
    role="button"
    tabindex="-1"
    on:click|self={handleCancel}
  >
    <div
      class="confirm-dialog-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div class="confirm-dialog-header">
        <h3 id="confirm-dialog-title">⚠️ {title}</h3>
        <button type="button" class="confirm-dialog-close-btn" on:click={handleCancel}>✕</button>
      </div>

      <div class="confirm-dialog-body">
        <p>{message}</p>
      </div>

      <div class="confirm-dialog-footer">
        <button type="button" class="confirm-dialog-keep-btn" on:click={handleCancel}>
          {cancelText}
        </button>
        <button type="button" class="confirm-dialog-discard-btn" on:click={handleConfirm}>
          {confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}
