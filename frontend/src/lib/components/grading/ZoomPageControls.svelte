<script lang="ts">
  import "./ZoomPageControls.css";
  import { gradingStore } from "$lib/grading/gradingStore";

  export let onPagePrev: () => void;
  export let onPageNext: () => void;
  export let onToggleAutoCrop: () => void;
  export let onZoomOut: () => void;
  export let onZoomIn: () => void;
  export let onResetZoom: () => void;
</script>

<div class="zoom-page-controls-floating-zoom-overlay">
  {#if $gradingStore.isScanPdf && $gradingStore.totalPages > 1}
    <button
      type="button"
      class="zoom-page-controls-zoom-btn"
      on:click={onPagePrev}
      disabled={$gradingStore.currentPage <= 1}
      title="Vorherige Seite (Pfeil links)"
    >◀</button>
    <span class="zoom-page-controls-page-indicator">S. {$gradingStore.currentPage}/{$gradingStore.totalPages}</span>
    <button
      type="button"
      class="zoom-page-controls-zoom-btn"
      on:click={onPageNext}
      disabled={$gradingStore.currentPage >= $gradingStore.totalPages}
      title="Nächste Seite (Pfeil rechts)"
    >▶</button>
    <div class="zoom-page-controls-zoom-divider"></div>
  {/if}
  <button
    type="button"
    class="zoom-page-controls-zoom-btn"
    class:zoom-page-controls-active={$gradingStore.isAutoCropEnabled}
    on:click={onToggleAutoCrop}
    title={$gradingStore.isAutoCropEnabled ? "Ränder zugeschnitten (Klicken zum Zurücksetzen)" : "Ränder zuschneiden"}
  >
    ✂️ {$gradingStore.isAutoCropEnabled ? "Zuschnitt" : "Ganze Seite"}
  </button>
  <div class="zoom-page-controls-zoom-divider"></div>
  <button
    type="button"
    class="zoom-page-controls-zoom-btn"
    on:click={onZoomOut}
    title="Verkleinern (-)"
  >➖</button>
  <span class="zoom-page-controls-zoom-level">{$gradingStore.zoomScale === 1.0 ? "Fit" : `${Math.round($gradingStore.zoomScale * 100)}%`}</span>
  <button
    type="button"
    class="zoom-page-controls-zoom-btn"
    on:click={onZoomIn}
    title="Vergrößern (+)"
  >➕</button>
  <button
    type="button"
    class="zoom-page-controls-zoom-btn"
    on:click={onResetZoom}
    title="Anpassen (Fit)"
  >Fit</button>
</div>
