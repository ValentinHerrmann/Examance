<script lang="ts">
  import "./ConfirmDialog.css";
  import { createEventDispatcher } from "svelte";
  import { t } from "$lib/i18n";

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
      class="w-full max-w-[440px] overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-2xl animate-[confirm-dialog-scale-in_0.15s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div class="flex items-center justify-between border-b border-slate-700 px-6 py-5">
        <h3 id="confirm-dialog-title" class="m-0 flex items-center gap-2 text-lg text-slate-100">⚠️ {resolvedTitle}</h3>
        <button type="button" class="rounded p-1 text-lg leading-none text-slate-400 transition-colors duration-150 hover:text-slate-100" on:click={handleCancel}>✕</button>
      </div>

      <div class="p-6 text-[0.95rem] leading-[1.5] text-slate-300">
        <p class="m-0">{resolvedMessage}</p>
      </div>

      <div class="flex justify-end gap-3 border-t border-slate-700 bg-slate-900 px-6 py-4">
        <button type="button" class="rounded-md border-none bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-slate-600" on:click={handleCancel}>
          {resolvedCancelText}
        </button>
        <button type="button" class="rounded-md border-none bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-red-700" on:click={handleConfirm}>
          {resolvedConfirmText}
        </button>
      </div>
    </div>
  </div>
{/if}
