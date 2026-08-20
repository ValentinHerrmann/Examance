<script lang="ts">
  /**
   * Thin, chromeless PDF preview built on EmbedPDF (WASM/PDFium) instead of
   * an `<iframe>`/`<object>` pointed at a blob URL. Unlike the browser's
   * built-in PDF plugin, this never shows a toolbar — see `lib/pdf/embedpdf.ts`
   * for the (empty) UI schema — and it supports smooth mouse-wheel zooming,
   * pinch-to-zoom, and an auto-hiding zoom preset overlay.
   */
  import { onDestroy } from "svelte";
  import {
    ZoomMode,
    ZoomPlugin,
    type EmbedPdfContainer,
    type ZoomLevel,
    type ZoomCapability,
  } from "@embedpdf/snippet";
  import { t } from "$lib/i18n";

  /** URL (including `blob:`) of the PDF to display. `null` renders nothing. */
  export let src: string | null = null;
  export let theme: "light" | "dark" | "system" = "dark";
  export let zoomLevel: ZoomLevel | undefined = undefined;

  let containerEl: HTMLDivElement;
  let viewer: EmbedPdfContainer | null = null;
  let mountedSrc: string | null = null;
  let zoomCap: ZoomCapability | null = null;
  let unsubscribeZoom: (() => void) | null = null;

  let currentZoomPercent: number = 100;
  let isOverlayVisible: boolean = false;
  let overlayTimeout: ReturnType<typeof setTimeout> | null = null;
  let isMouseOverOverlay: boolean = false;

  function triggerZoomOverlay() {
    isOverlayVisible = true;
    if (overlayTimeout) clearTimeout(overlayTimeout);
    if (!isMouseOverOverlay) {
      overlayTimeout = setTimeout(() => {
        isOverlayVisible = false;
      }, 2500);
    }
  }

  function handleOverlayMouseEnter() {
    isMouseOverOverlay = true;
    if (overlayTimeout) clearTimeout(overlayTimeout);
  }

  function handleOverlayMouseLeave() {
    isMouseOverOverlay = false;
    triggerZoomOverlay();
  }

  function setZoom(level: ZoomLevel) {
    if (zoomCap) {
      zoomCap.requestZoom(level);
      triggerZoomOverlay();
    }
  }

  function findScrollContainer(path: EventTarget[]): HTMLElement | null {
    for (const target of path) {
      if (target instanceof HTMLElement) {
        const style = window.getComputedStyle(target);
        const overflowY = style.overflowY;
        const overflowX = style.overflowX;
        if (
          overflowY === "auto" ||
          overflowY === "scroll" ||
          overflowX === "auto" ||
          overflowX === "scroll"
        ) {
          return target;
        }
      }
    }
    return null;
  }

  function handleWheel(e: WheelEvent) {
    // Smooth continuous mouse-wheel zoom when Ctrl or Cmd is pressed
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();

      triggerZoomOverlay();

      if (zoomCap) {
        let deltaY = e.deltaY;
        if (e.deltaMode === 1) deltaY *= 16;
        else if (e.deltaMode === 2) deltaY *= 100;

        deltaY = Math.max(-200, Math.min(200, deltaY));
        const scaleFactor = Math.pow(0.999, deltaY);
        const currentZoom = zoomCap.getState()?.currentZoomLevel || 1.0;
        const targetZoom = Math.min(Math.max(currentZoom * scaleFactor, 0.25), 5.0);
        zoomCap.requestZoom(targetZoom);
      }
      return;
    }

    // Regular page scrolling (without Ctrl/Cmd)
    const path = e.composedPath();
    const scrollContainer = findScrollContainer(path);
    if (!scrollContainer) return;

    e.preventDefault();
    e.stopPropagation();

    // Scale down mouse-wheel scrolling step size for smoother scrolling
    const scale = 0.35;
    let dx = e.deltaX;
    let dy = e.deltaY;

    if (e.deltaMode === 1) {
      // DOM_DELTA_LINE
      dx *= 16;
      dy *= 16;
    } else if (e.deltaMode === 2) {
      // DOM_DELTA_PAGE
      dx *= 100;
      dy *= 100;
    }

    scrollContainer.scrollBy({
      left: dx * scale,
      top: dy * scale,
      behavior: "auto",
    });
  }

  function destroy() {
    if (overlayTimeout) clearTimeout(overlayTimeout);
    if (unsubscribeZoom) {
      unsubscribeZoom();
      unsubscribeZoom = null;
    }
    zoomCap = null;
    if (containerEl) {
      containerEl.removeEventListener("wheel", handleWheel, { capture: true });
      containerEl.innerHTML = "";
    }
    viewer = null;
    mountedSrc = null;
    isOverlayVisible = false;
  }

  async function mount(url: string) {
    const { mountEmbedPdf } = await import("$lib/pdf/embedpdf");
    // A src change (or unmount racing a fast page switch) may land here
    // after containerEl is gone or after a newer `mount()` already ran.
    if (!containerEl || src !== url) return;
    destroy();
    if (!containerEl) return;
    viewer = mountEmbedPdf({ target: containerEl, src: url, theme, zoomLevel }) ?? null;
    mountedSrc = url;
    containerEl.addEventListener("wheel", handleWheel, { capture: true, passive: false });

    if (viewer) {
      viewer.registry.then((reg) => {
        try {
          const plugin = reg.getPlugin<ZoomPlugin>("zoom");
          if (plugin) {
            const zoomPluginAny = plugin as unknown as {
              provides?: () => ZoomCapability;
              getCapability?: () => ZoomCapability;
            };
            zoomCap = (zoomPluginAny.provides ? zoomPluginAny.provides() : zoomPluginAny.getCapability?.()) ?? null;
            if (zoomCap) {
              const state = zoomCap.getState?.();
              if (state?.currentZoomLevel) {
                currentZoomPercent = Math.round(state.currentZoomLevel * 100);
              }
              const unsub = zoomCap.onStateChange?.(({ state: s }) => {
                if (s?.currentZoomLevel) {
                  const newPercent = Math.round(s.currentZoomLevel * 100);
                  if (newPercent !== currentZoomPercent) {
                    currentZoomPercent = newPercent;
                    triggerZoomOverlay();
                  }
                }
              });
              if (typeof unsub === "function") {
                unsubscribeZoom = unsub;
              }
            }
          }
        } catch (err) {
          console.warn("Could not get zoom capability:", err);
        }
      });
    }
  }

  // `containerEl` only exists after the initial render (bind:this), so this
  // reactive block also covers the "mount on first render" case — no
  // separate onMount() call needed.
  $: if (containerEl && src && src !== mountedSrc) {
    mount(src);
  } else if (containerEl && !src && mountedSrc) {
    destroy();
  }

  onDestroy(() => {
    destroy();
  });
</script>

<div class="embed-pdf-wrapper">
  <div bind:this={containerEl} class="embed-pdf-viewer"></div>
  {#if src && isOverlayVisible}
    <div
      class="embed-pdf-zoom-overlay"
      on:mouseenter={handleOverlayMouseEnter}
      on:mouseleave={handleOverlayMouseLeave}
      role="toolbar"
      tabindex="-1"
      aria-label="Zoom controls"
    >
      <span class="zoom-percent">{currentZoomPercent}%</span>
      <span class="zoom-divider"></span>
      <button
        type="button"
        class="zoom-btn"
        on:click={() => setZoom(1.0)}
      >
        100%
      </button>
      <button
        type="button"
        class="zoom-btn inline-flex items-center justify-center leading-none text-xl"
        style:font-size="1.5rem"
        on:click={() => setZoom(ZoomMode.FitWidth)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m18 8 4 4-4 4M6 8l-4 4 4 4M2 12h20" />
        </svg>
      </button>
      <button
        type="button"
        class="zoom-btn inline-flex items-center justify-center leading-none text-xl"
        style:font-size="1.5rem"
        on:click={() => setZoom(ZoomMode.FitPage)}
      > 
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m8 18 4 4 4-4M8 6l4-4 4 4M12 2v20" />
        </svg>
      </button>
    </div>
  {/if}
</div>

<style>
  .embed-pdf-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .embed-pdf-viewer {
    display: flex;
    width: 100%;
    height: 100%;
  }
  /* The custom element EmbedPDF mounts (<embedpdf-container>) has no
     intrinsic size; make it fill this wrapper. */
  .embed-pdf-viewer :global(embedpdf-container) {
    display: block;
    width: 100%;
    height: 100%;
  }

  .embed-pdf-zoom-overlay {
    position: absolute;
    top: 10px;
    right: 12px;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background-color: rgba(15, 23, 42, 0.88);
    color: #cbd5e1;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 500;
    backdrop-filter: blur(6px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    animation: zoom-overlay-fade-in 0.15s ease-out;
  }

  @keyframes zoom-overlay-fade-in {
    from {
      opacity: 0;
      transform: translateY(-2px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .zoom-percent {
    font-weight: 600;
    color: #38bdf8;
    padding: 0 4px;
    min-width: 36px;
    text-align: center;
  }

  .zoom-divider {
    width: 1px;
    height: 12px;
    background-color: #334155;
  }

  .zoom-btn {
    background: transparent;
    border: none;
    color: #cbd5e1;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .zoom-btn:hover {
    background-color: rgba(255, 255, 255, 0.12);
    color: #ffffff;
  }
</style>
