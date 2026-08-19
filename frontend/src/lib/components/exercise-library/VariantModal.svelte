<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import LatexEditor from "$lib/components/LatexEditor.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import { t } from "$lib/i18n";

  export let isOpen = false;
  export let variantBaseEx: ExerciseRecord | null = null;
  export let variantKey = "";
  export let variantLatexBody = "";
  export let showConfirmClose = false;
  export let onRequestClose: () => void;
  export let onSave: () => void;
  export let onForceCloseConfirm: () => void;
  export let onCancelConfirmClose: () => void;
</script>

{#if isOpen && variantBaseEx}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/75"
    role="button"
    tabindex="-1"
    on:click|self={onRequestClose}
    on:keydown|self={(e) => e.key === "Escape" && onRequestClose()}
  >
    <div class="flex max-h-[90vh] w-[90%] max-w-[800px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
      <div class="flex items-center justify-between border-b border-slate-700 px-6 py-4">
        <h3 class="m-0 text-sky-400">{$t("exercises.variantModal.title")}</h3>
        <button class="cursor-pointer border-0 bg-transparent text-xl text-slate-400" on:click={onRequestClose}>✕</button>
      </div>

      <div class="flex-1 overflow-y-auto p-6">
        <p class="m-0 mb-4 text-sm text-slate-400">
          {$t("exercises.variantModal.hint")}
        </p>

        <div class="mb-4 bg-sky-600/20 px-6 py-2 text-[0.85rem] text-sky-300">
          {$t("exercises.variantModal.groupContext", { name: variantBaseEx.name, topic: variantBaseEx.topicTag || '_General', gradeSuffix: variantBaseEx.grade ? $t("exercises.variantModal.groupContextGradeSuffix", { grade: variantBaseEx.grade }) : '' })}
        </div>

        <div class="mb-4 flex flex-col gap-[0.375rem]">
          <label for="variantKey" class="text-sm text-slate-300">{$t("exercises.variantModal.keyLabel")}</label>
          <input
            id="variantKey"
            type="text"
            bind:value={variantKey}
            placeholder={$t("exercises.variantModal.keyPlaceholder")}
            required
            class="rounded-md border border-slate-700 bg-slate-900 p-[0.625rem] text-white"
          />
        </div>

        <div class="mb-4 flex flex-col gap-[0.375rem]">
          <label for="variantBody" class="text-sm text-slate-300"
            >{$t("exercises.variantModal.latexBodyLabel")}</label
          >
          <LatexEditor bind:value={variantLatexBody} rows={8} />
        </div>
      </div>

      <div class="flex justify-end gap-4 border-t border-slate-700 px-6 py-4">
        <button class="cursor-pointer rounded-md border-0 bg-slate-700 px-5 py-[0.625rem] text-white" on:click={onRequestClose}>{$t("common.cancel")}</button>
        <button class="cursor-pointer rounded-md border-0 bg-green-600 px-5 py-[0.625rem] font-semibold text-white" on:click={onSave}>{$t("exercises.variantModal.saveButton")}</button>
      </div>
    </div>
  </div>
{/if}

<ConfirmDialog
  isOpen={showConfirmClose}
  title={$t("exercises.variantModal.discardTitle")}
  message={$t("exercises.variantModal.discardMessage")}
  confirmText={$t("exercises.confirmDiscard.confirmText")}
  cancelText={$t("exercises.confirmDiscard.cancelText")}
  on:confirm={onForceCloseConfirm}
  on:cancel={onCancelConfirmClose}
/>
