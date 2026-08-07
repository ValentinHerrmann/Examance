<script lang="ts">
  import "./ZoomableImage.css";

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
  class="zoomable-image-container"
  class:grabbing={isDragging}
  class:zoomed={zoomLevel > 1}
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
    class="zoomable-image-image"
    style="transform: translate({panX}px, {panY}px) scale({zoomLevel});"
    draggable="false"
  />

  <div class="zoomable-image-zoom-controls">
    <button class="zoomable-image-zoom-btn" on:click={zoomOut} title="Zoom Out">−</button>
    <span class="zoomable-image-zoom-level">{Math.round(zoomLevel * 100)}%</span>
    <button class="zoomable-image-zoom-btn" on:click={zoomIn} title="Zoom In">+</button>
    <button class="zoomable-image-zoom-btn zoomable-image-reset-btn" on:click={reset} title="Reset to Fit">Fit</button>
  </div>
</div>
