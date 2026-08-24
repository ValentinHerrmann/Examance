<script lang="ts">
  import { gradingStore } from "$lib/grading/gradingStore";
  import { t } from "$lib/i18n";

  export let onPagePrev: () => void;
  export let onPageNext: () => void;
  export let onToggleAutoCrop: () => void;
  export let onZoomOut: () => void;
  export let onZoomIn: () => void;
  export let onResetZoom: () => void;

  const zoomBtn =
    "shrink-0 rounded-md border border-line bg-surface-raised px-2 py-1 text-xs font-medium text-slate-300 transition-colors duration-150 hover:bg-line-strong hover:text-slate-50";
  const zoomBtnActive =
    "shrink-0 rounded-md border border-accent bg-accent-strong px-2 py-1 text-xs font-medium text-white transition-colors duration-150";
</script>

<!--
  Docked below the canvas on small screens, floating over it from `lg` up —
  same reasoning as the annotation toolbar.
-->
<div
  class="scroll-pane z-30 flex shrink-0 items-center justify-center gap-1.5 overflow-x-auto rounded-lg border border-slate-700/80 bg-slate-900/90 px-2 py-1.5 text-xs backdrop-blur-sm
    lg:absolute lg:right-3 lg:bottom-3 lg:justify-end lg:gap-[0.35rem] lg:overflow-visible lg:rounded-[10px] lg:px-[0.6rem] lg:py-[0.35rem] lg:shadow-[0_10px_25px_-5px_rgba(0,0,0,0.5)]"
>
  {#if $gradingStore.isScanPdf && $gradingStore.totalPages > 1}
    <button
      type="button"
      class={zoomBtn}
      on:click={onPagePrev}
      disabled={$gradingStore.currentPage <= 1}
      title={$t("grading.zoom.pagePrevTitle")}
    >◀</button>
    <span>{$t("grading.zoom.pageIndicator", { current: $gradingStore.currentPage, total: $gradingStore.totalPages })}</span>
    <button
      type="button"
      class={zoomBtn}
      on:click={onPageNext}
      disabled={$gradingStore.currentPage >= $gradingStore.totalPages}
      title={$t("grading.zoom.pageNextTitle")}
    >▶</button>
    <div class="mx-[0.15rem] h-4 w-px bg-slate-700"></div>
  {/if}
  <button
    type="button"
    class={$gradingStore.isAutoCropEnabled ? zoomBtnActive : zoomBtn}
    on:click={onToggleAutoCrop}
    title={$gradingStore.isAutoCropEnabled ? $t("grading.zoom.autoCropOnTitle") : $t("grading.zoom.autoCropOffTitle")}
  >
    ✂️ {$gradingStore.isAutoCropEnabled ? $t("grading.zoom.autoCropOn") : $t("grading.zoom.autoCropOff")}
  </button>
  <div class="mx-[0.15rem] h-4 w-px bg-slate-700"></div>
  <button
    type="button"
    class={zoomBtn}
    on:click={onZoomOut}
    title={$t("grading.zoom.zoomOutTitle")}
  >➖</button>
  <span class="px-1 font-mono font-bold text-slate-200">{$gradingStore.zoomScale === 1.0 ? $t("grading.zoom.fitLabel") : `${Math.round($gradingStore.zoomScale * 100)}%`}</span>
  <button
    type="button"
    class={zoomBtn}
    on:click={onZoomIn}
    title={$t("grading.zoom.zoomInTitle")}
  >➕</button>
  <button
    type="button"
    class={zoomBtn}
    on:click={onResetZoom}
    title={$t("grading.zoom.fitTitle")}
  >{$t("grading.zoom.fitLabel")}</button>
</div>
