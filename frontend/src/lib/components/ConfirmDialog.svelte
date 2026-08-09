<script lang="ts">
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
    class="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/85 p-4 backdrop-blur-sm"
    role="button"
    tabindex="-1"
    on:click|self={handleCancel}
  >
    <div
      class="w-full max-w-[440px] overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-2xl animate-[scaleIn_0.15s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div class="flex items-center justify-between border-b border-slate-700 px-6 py-5">
        <h3 id="confirm-dialog-title" class="m-0 flex items-center gap-2 text-lg text-slate-100">⚠️ {title}</h3>
        <button type="button" class="rounded p-1 text-lg leading-none text-slate-400 transition-colors duration-150 hover:text-slate-100" on:click={handleCancel}>✕</button>
      </div>

      <div class="p-6 text-[0.95rem] leading-[1.5] text-slate-300">
        <p class="m-0">{message}</p>
      </div>

      <div class="flex justify-end gap-3 border-t border-slate-700 bg-slate-900 px-6 py-4">
        <button type="button" class="rounded-md border-none bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-slate-600" on:click={handleCancel}>
          {cancelText}
        </button>
        <button type="button" class="rounded-md border-none bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-red-700" on:click={handleConfirm}>
          {confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
