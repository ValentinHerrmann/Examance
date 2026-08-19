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
  class="w-full py-2 bg-sky-600 text-white font-semibold text-[0.825rem] border-none rounded-md cursor-pointer transition-colors duration-150 hover:enabled:bg-sky-700 disabled:opacity-60 disabled:cursor-not-allowed"
  on:click={onSave}
  disabled={$gradingStore.isSaving}
>
  {$gradingStore.isSaving ? $t("grading.actions.saving") : $t("grading.actions.save")}
</button>

<div class="flex gap-2">
  <button
    class="flex-1 py-[0.4rem] px-2 bg-slate-700 text-slate-300 border-none rounded-md text-[0.775rem] font-medium cursor-pointer transition-colors duration-150 hover:enabled:bg-slate-600 hover:enabled:text-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
    on:click={onPrev}
    disabled={currentIndex === 0}
  >{$t("grading.actions.prev")}</button>
  <button
    class="flex-1 py-[0.4rem] px-2 bg-slate-700 text-slate-300 border-none rounded-md text-[0.775rem] font-medium cursor-pointer transition-colors duration-150 hover:enabled:bg-slate-600 hover:enabled:text-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
    on:click={onNext}
  >{$t("grading.actions.next")}</button>
</div>
