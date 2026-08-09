<script lang="ts">
  import { gradingStore } from "$lib/grading/gradingStore";

  export let onPagePrev: () => void;
  export let onPageNext: () => void;
  export let onToggleAutoCrop: () => void;
  export let onZoomOut: () => void;
  export let onZoomIn: () => void;
  export let onResetZoom: () => void;

  const zoomBtn =
    "rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300 transition-all duration-150 ease-[ease] hover:bg-slate-700 hover:text-slate-50";
  const zoomBtnActive =
    "rounded-md border border-sky-400 bg-sky-600 px-2 py-1 text-xs font-medium text-white transition-all duration-150 ease-[ease]";
</script>

<div class="absolute bottom-3 right-3 z-30 flex items-center gap-[0.35rem] rounded-[10px] border border-slate-700/80 bg-slate-900/90 px-[0.6rem] py-[0.35rem] text-xs shadow-[0_10px_25px_-5px_rgba(0,0,0,0.5)] backdrop-blur-sm">
  {#if $gradingStore.isScanPdf && $gradingStore.totalPages > 1}
    <button
      type="button"
      class={zoomBtn}
      on:click={onPagePrev}
      disabled={$gradingStore.currentPage <= 1}
      title="Vorherige Seite (Pfeil links)"
    >◀</button>
    <span>S. {$gradingStore.currentPage}/{$gradingStore.totalPages}</span>
    <button
      type="button"
      class={zoomBtn}
      on:click={onPageNext}
      disabled={$gradingStore.currentPage >= $gradingStore.totalPages}
      title="Nächste Seite (Pfeil rechts)"
    >▶</button>
    <div class="mx-[0.15rem] h-4 w-px bg-slate-700"></div>
  {/if}
  <button
    type="button"
    class={$gradingStore.isAutoCropEnabled ? zoomBtnActive : zoomBtn}
    on:click={onToggleAutoCrop}
    title={$gradingStore.isAutoCropEnabled ? "Ränder zugeschnitten (Klicken zum Zurücksetzen)" : "Ränder zuschneiden"}
  >
    ✂️ {$gradingStore.isAutoCropEnabled ? "Zuschnitt" : "Ganze Seite"}
  </button>
  <div class="mx-[0.15rem] h-4 w-px bg-slate-700"></div>
  <button
    type="button"
    class={zoomBtn}
    on:click={onZoomOut}
    title="Verkleinern (-)"
  >➖</button>
  <span class="px-1 font-mono font-bold text-slate-200">{$gradingStore.zoomScale === 1.0 ? "Fit" : `${Math.round($gradingStore.zoomScale * 100)}%`}</span>
  <button
    type="button"
    class={zoomBtn}
    on:click={onZoomIn}
    title="Vergrößern (+)"
  >➕</button>
  <button
    type="button"
    class={zoomBtn}
    on:click={onResetZoom}
    title="Anpassen (Fit)"
  >Fit</button>
</div>
