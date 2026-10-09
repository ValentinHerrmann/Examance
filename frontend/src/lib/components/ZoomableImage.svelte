<script lang="ts">
  import { t } from "#lib/i18n";
  import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
  import { Button } from "#lib/components/ui";

  interface Props {
    src: string;
    alt?: string;
  }

  let { src, alt = '' }: Props = $props();

  let zoomLevel = $state(1.0);
  let panX = $state(0);
  let panY = $state(0);
  let isDragging = $state(false);
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

  // Svelte 5 registers `onwheel` as passive, so preventDefault needs a non-passive listener.
  function wheelAction(node: HTMLElement) {
    node.addEventListener("wheel", handleWheel, { passive: false });
    return { destroy: () => node.removeEventListener("wheel", handleWheel) };
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
  role="presentation"
  class="relative flex max-h-[70dvh] min-h-[200px] w-full touch-none select-none items-center justify-center overflow-hidden rounded-md bg-surface-viewer {isDragging ? 'cursor-grabbing' : 'cursor-grab'}"
  use:wheelAction
  onmousedown={handleMouseDown}
  onmousemove={handleMouseMove}
  onmouseup={handleMouseUp}
  onmouseleave={handleMouseLeave}
  ondblclick={toggleZoom}
>
  <img
    src={src}
    alt={alt}
    class="pointer-events-none max-h-[70dvh] max-w-full origin-center object-contain transition-transform duration-75 ease-out"
    style="transform: translate({panX}px, {panY}px) scale({zoomLevel});"
    draggable="false"
  />

  <div class="absolute right-3 bottom-3 z-10 flex items-center gap-1 rounded-md border border-line bg-surface-raised/90 px-2 py-1 shadow-sm">
    <Button variant="text" severity="secondary" size="sm" iconOnly icon={faMinus} ariaLabel={$t("editor.zoom.zoomOut")} title={$t("editor.zoom.zoomOut")} onClick={zoomOut} />
    <span class="min-w-11 text-center font-mono text-xs font-medium text-muted">{Math.round(zoomLevel * 100)}%</span>
    <Button variant="text" severity="secondary" size="sm" iconOnly icon={faPlus} ariaLabel={$t("editor.zoom.zoomIn")} title={$t("editor.zoom.zoomIn")} onClick={zoomIn} />
    <Button variant="text" severity="secondary" size="sm" title={$t("editor.zoom.resetToFit")} onClick={reset}>{$t("editor.zoom.fit")}</Button>
  </div>
</div>
