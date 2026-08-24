<script lang="ts">
  import { t } from "$lib/i18n";
  export let src: string;
  export let alt: string = '';

  let zoomLevel = 1.0;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 5.0;

  function resetPan() {
    if (zoomLevel <= 1) {
      panX = 0;
      panY = 0;
    }
  }

  function zoomIn() {
    zoomLevel = Math.min(zoomLevel + 0.25, MAX_ZOOM);
    resetPan();
  }

  function zoomOut() {
    const oldZoom = zoomLevel;
    zoomLevel = Math.max(zoomLevel - 0.25, MIN_ZOOM);
    if (zoomLevel <= 1) {
      panX = 0;
      panY = 0;
    } else if (oldZoom <= 1) {
      // transitioning from fit to zoomed, center the image
      panX = 0;
      panY = 0;
    }
  }

  function reset() {
    zoomLevel = 1.0;
    panX = 0;
    panY = 0;
  }

  function toggleZoom() {
    if (zoomLevel > 1.0) {
      reset();
    } else {
      zoomLevel = 2.0;
      panX = 0;
      panY = 0;
    }
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    const oldZoom = zoomLevel;
    zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel + delta));
    if (oldZoom <= 1 && zoomLevel > 1) {
      panX = 0;
      panY = 0;
    } else if (zoomLevel <= 1) {
      panX = 0;
      panY = 0;
    }
  }

  function handleMouseDown(e: MouseEvent) {
    if (zoomLevel <= 1) return;
    isDragging = true;
    dragStartX = e.clientX - panX;
    dragStartY = e.clientY - panY;
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    panX = e.clientX - dragStartX;
    panY = e.clientY - dragStartY;
  }

  function handleMouseUp() {
    isDragging = false;
  }

  function handleMouseLeave() {
    isDragging = false;
  }
</script>

<div
  class="relative flex max-h-[70dvh] min-h-[200px] w-full touch-none select-none items-center justify-center overflow-hidden rounded-md bg-slate-800 {isDragging ? 'cursor-grabbing' : 'cursor-grab'}"
  on:wheel|preventDefault={handleWheel}
  on:mousedown={handleMouseDown}
  on:mousemove={handleMouseMove}
  on:mouseup={handleMouseUp}
  on:mouseleave={handleMouseLeave}
  on:dblclick={toggleZoom}
>
  <img
    src={src}
    alt={alt}
    class="pointer-events-none max-h-[70dvh] max-w-full origin-center object-contain transition-transform duration-[50ms] ease-out"
    style="transform: translate({panX}px, {panY}px) scale({zoomLevel});"
    draggable="false"
  />

  <div class="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-lg bg-slate-900/85 px-2 py-1 backdrop-blur-sm">
    <button class="flex h-8 w-8 items-center justify-center rounded border-none bg-transparent text-lg text-slate-50 transition-colors duration-150 hover:bg-slate-400/20" on:click={zoomOut} title={$t("editor.zoom.zoomOut")}>−</button>
    <span class="min-w-[42px] text-center font-mono text-[0.8rem] font-medium text-slate-400">{Math.round(zoomLevel * 100)}%</span>
    <button class="flex h-8 w-8 items-center justify-center rounded border-none bg-transparent text-lg text-slate-50 transition-colors duration-150 hover:bg-slate-400/20" on:click={zoomIn} title={$t("editor.zoom.zoomIn")}>+</button>
    <button class="flex h-8 w-auto items-center justify-center rounded border-none bg-transparent px-2 text-[0.8rem] font-semibold text-slate-50 transition-colors duration-150 hover:bg-slate-400/20" on:click={reset} title={$t("editor.zoom.resetToFit")}>{$t("editor.zoom.fit")}</button>
  </div>
</div>
