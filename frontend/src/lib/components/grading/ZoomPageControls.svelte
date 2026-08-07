<script lang="ts">
  import { gradingStore } from "$lib/grading/gradingStore";

  export let onPagePrev: () => void;
  export let onPageNext: () => void;
  export let onToggleAutoCrop: () => void;
  export let onZoomOut: () => void;
  export let onZoomIn: () => void;
  export let onResetZoom: () => void;
</script>

<div class="floating-zoom-overlay">
  {#if $gradingStore.isScanPdf && $gradingStore.totalPages > 1}
    <button
      type="button"
      class="zoom-btn"
      on:click={onPagePrev}
      disabled={$gradingStore.currentPage <= 1}
      title="Vorherige Seite (Pfeil links)"
    >◀</button>
    <span class="page-indicator">S. {$gradingStore.currentPage}/{$gradingStore.totalPages}</span>
    <button
      type="button"
      class="zoom-btn"
      on:click={onPageNext}
      disabled={$gradingStore.currentPage >= $gradingStore.totalPages}
      title="Nächste Seite (Pfeil rechts)"
    >▶</button>
    <div class="zoom-divider"></div>
  {/if}
  <button
    type="button"
    class="zoom-btn"
    class:active={$gradingStore.isAutoCropEnabled}
    on:click={onToggleAutoCrop}
    title={$gradingStore.isAutoCropEnabled ? "Ränder zugeschnitten (Klicken zum Zurücksetzen)" : "Ränder zuschneiden"}
  >
    ✂️ {$gradingStore.isAutoCropEnabled ? "Zuschnitt" : "Ganze Seite"}
  </button>
  <div class="zoom-divider"></div>
  <button
    type="button"
    class="zoom-btn"
    on:click={onZoomOut}
    title="Verkleinern (-)"
  >➖</button>
  <span class="zoom-level">{$gradingStore.zoomScale === 1.0 ? "Fit" : `${Math.round($gradingStore.zoomScale * 100)}%`}</span>
  <button
    type="button"
    class="zoom-btn"
    on:click={onZoomIn}
    title="Vergrößern (+)"
  >➕</button>
  <button
    type="button"
    class="zoom-btn"
    on:click={onResetZoom}
    title="Anpassen (Fit)"
  >Fit</button>
</div>

<style>
  .floating-zoom-overlay {
    position: absolute;
    bottom: 0.75rem;
    right: 0.75rem;
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.6rem;
    background: rgba(15, 23, 42, 0.9);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(51, 65, 85, 0.8);
    border-radius: 10px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    font-size: 0.75rem;
  }

  .zoom-btn {
    background: #1e293b;
    border: 1px solid #334155;
    color: #cbd5e1;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 500;
    transition: all 0.15s ease;
  }

  .zoom-btn:hover {
    background: #334155;
    color: #f8fafc;
  }

  .zoom-btn.active {
    background: #0284c7;
    color: white;
    border-color: #38bdf8;
  }

  .zoom-level {
    font-family: monospace;
    font-weight: 700;
    color: #e2e8f0;
    padding: 0 0.25rem;
  }

  .zoom-divider {
    width: 1px;
    height: 16px;
    background: #334155;
    margin: 0 0.15rem;
  }
</style>
