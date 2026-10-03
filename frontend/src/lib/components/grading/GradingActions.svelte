<script lang="ts">
  import { gradingStore } from "$lib/grading/gradingStore";
  import { t } from "$lib/i18n";

  // Async persistence and navigation stay route-owned; this component only
  // forwards user intent via callback props.
  export let onSave: () => void;
  export let onPrev: () => void;
  export let onNext: () => void;
  export let currentIndex: number;
</script>

<button
  class="w-full py-2 bg-primary text-primary-contrast font-semibold text-sm border-none rounded-md cursor-pointer transition-colors duration-150 hover:enabled:bg-primary disabled:opacity-60 disabled:cursor-not-allowed"
  on:click={onSave}
  disabled={$gradingStore.isSaving}
>
  {$gradingStore.isSaving ? $t("grading.actions.saving") : $t("grading.actions.save")}
</button>

<div class="flex flex-wrap gap-2">
  <button
    class="flex-1 py-[0.4rem] px-2 bg-surface-inset text-content border-none rounded-md text-xs font-medium cursor-pointer transition-colors duration-150 hover:enabled:bg-surface-inset hover:enabled:text-content disabled:opacity-40 disabled:cursor-not-allowed"
    on:click={onPrev}
    disabled={currentIndex === 0}
  >{$t("grading.actions.prev")}</button>
  <button
    class="flex-1 py-[0.4rem] px-2 bg-surface-inset text-content border-none rounded-md text-xs font-medium cursor-pointer transition-colors duration-150 hover:enabled:bg-surface-inset hover:enabled:text-content disabled:opacity-40 disabled:cursor-not-allowed"
    on:click={onNext}
  >{$t("grading.actions.next")}</button>
</div>
