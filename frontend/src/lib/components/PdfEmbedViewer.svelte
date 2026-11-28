<script lang="ts">
  // Chromeless PDF preview on EmbedPDF (WASM/PDFium) with wheel/pinch zoom and a zoom overlay; see `lib/pdf/embedpdf.ts`.
  import { onDestroy, untrack } from "svelte";
  import {
    ZoomMode,
    ZoomPlugin,
    type EmbedPdfContainer,
    type ZoomLevel,
    type ZoomCapability,
  } from "@embedpdf/snippet";
  import { t } from "#lib/i18n";
  import { theme as appTheme } from "#lib/stores/theme";
  import type { PageLocator } from "#lib/pdf/embedpdf";
  import PageEditLayer, { type PageEditProps } from "#lib/components/latex/PageEditLayer.svelte";
  import ZoomOverlay, { type ZoomChoice } from "#lib/components/pdf/ZoomOverlay.svelte";
  import { wheelZoomTarget } from "#lib/pdf/wheelZoom";

  interface Props {
    /** URL (including `blob:`) of the PDF to display. `null` renders nothing. */
    src?: string | null;
    /** Defaults to the app theme and follows it while mounted. */
    theme?: "light" | "dark" | "system" | undefined;
    zoomLevel?: ZoomLevel | undefined;
    /** Clicks, drags, typing and the editor's cursor on the pages (issue #347; `latex/PageEditLayer`). */
    edit?: PageEditProps;
    /** The viewer now shows the PDF at `url` (first mount or a swap): its result takes over clicks and marks (`PreviewSync.shown`). */
    onShown?: (url: string) => void;
  }

  let { src = null, theme = undefined, zoomLevel = undefined, edit = undefined, onShown = undefined }: Props = $props();

  let effectiveTheme = $derived(theme ?? $appTheme);

  let containerEl: HTMLDivElement | undefined = $state();
  let viewer: EmbedPdfContainer | null = $state.raw(null);
  let mountedSrc: string | null = $state(null);
  let zoomCap: ZoomCapability | null = null;
  let unsubscribeZoom: (() => void) | null = null;

  let currentZoomPercent: number = $state(100);
  let overlay: ReturnType<typeof ZoomOverlay> | undefined = $state();
  const triggerZoomOverlay = () => overlay?.show();

  function setZoom(choice: ZoomChoice) {
    const levels: Record<ZoomChoice, ZoomLevel> = { actual: 1.0, "fit-width": ZoomMode.FitWidth, "fit-page": ZoomMode.FitPage };
    zoomCap?.requestZoom(levels[choice]);
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

      if (zoomCap) zoomCap.requestZoom(wheelZoomTarget(zoomCap.getState()?.currentZoomLevel || 1.0, e));
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

  /** One mounted viewer in its own element inside the container; a new PDF mounts a second one hidden behind the first and swaps once it shows a rendered page, so a recompile never flashes EmbedPDF's loading screen. */
  interface Layer {
    el: HTMLDivElement;
    viewer: EmbedPdfContainer | null;
    stopLabels: () => void;
    locator?: Promise<PageLocator | null>;
    /** The last load into this viewer: the next one waits for it, so two never overlap. */
    loading?: Promise<unknown>;
    /** Bumped by every load into this viewer; a load that sees a newer one stops without showing or closing anything. */
    ticket?: number;
  }
  let shown: Layer | null = null;
  let pending: Layer | null = null;
  /** The viewer shown before the last swap, kept hidden: the next PDF loads into it instead of a new viewer and engine (live preview, issue #347). */
  let spare: Layer | null = null;

  function dropLayer(layer: Layer | null) {
    if (!layer) return;
    layer.stopLabels();
    layer.el.remove();
  }

  function unbindZoom() {
    if (unsubscribeZoom) {
      unsubscribeZoom();
      unsubscribeZoom = null;
    }
    zoomCap = null;
  }

  function destroy() {
    overlay?.hide();
    unbindZoom();
    dropLayer(pending);
    dropLayer(shown);
    dropLayer(spare);
    pending = null;
    shown = null;
    spare = null;
    containerEl?.removeEventListener("wheel", handleWheel, { capture: true });
    viewer = null;
    mountedSrc = null;
  }

  async function mount(url: string) {
    const { patchEmbedPdfShadow, mountEmbedPdf, embedPdfScroller, whenEmbedPdfShown, replaceEmbedPdfDocument, embedPdfPageImages, requestEmbedPdfZoom } = await import("#lib/pdf/embedpdf");
    scrollerOf = embedPdfScroller;
    // A src change (or unmount racing a fast page switch) may land here after containerEl is gone or after a newer `mount()` already ran.
    if (!containerEl || src !== url) return;
    const started = performance.now();
    const host = containerEl;
    // The replacement keeps the reader's zoom and scroll position.
    const previous = shown;
    const keptZoom = previous ? zoomCap?.getState?.()?.zoomLevel : undefined;
    const keptScroller = previous ? embedPdfScroller(previous.el) : null;
    const scroll = keptScroller ? { top: keptScroller.scrollTop, left: keptScroller.scrollLeft } : null;
    // A hidden viewer (still loading the previous PDF, or the one shown before) takes the new PDF: no new engine to start.
    const reuse = previous ? (pending ?? spare) : null;
    if (reuse?.viewer) {
      pending = reuse;
      spare = null;
      mountedSrc = url;
      const ticket = (reuse.ticket ?? 0) + 1;
      reuse.ticket = ticket;
      const superseded = () => pending !== reuse || reuse.ticket !== ticket;
      await reuse.loading;
      if (superseded() || !reuse.viewer) return;
      const stale = embedPdfPageImages(reuse.el);
      const job = replaceEmbedPdfDocument(reuse.viewer, url, keptZoom).catch(() => false);
      reuse.loading = job;
      const loaded = await job;
      const viewerNow = reuse.viewer;
      const ok = loaded && (await whenEmbedPdfShown(reuse.el, scroll, superseded, 5000, stale, () => requestEmbedPdfZoom(viewerNow, keptZoom)));
      if (superseded()) return;
      if (ok) {
        swapTo(reuse, previous, started, url);
        return;
      }
      // The viewer could not take the document: a fresh one below.
      dropLayer(reuse);
      pending = null;
    } else dropLayer(pending);
    const el = document.createElement("div");
    // Its own stacking context, so EmbedPDF's z-indexes stay below the edit layer's caret and selection.
    el.style.cssText = "position:absolute;inset:0;display:flex;z-index:0";
    if (previous) el.style.visibility = "hidden";
    host.appendChild(el);
    const layer: Layer = {
      el,
      viewer: mountEmbedPdf({ target: el, src: url, theme: effectiveTheme, zoomLevel: keptZoom ?? zoomLevel, editable: Boolean(edit) }) ?? null,
      stopLabels: patchEmbedPdfShadow(el, { pageLabel: $t("common.pdfPage"), regionLabel: $t("common.pdfPreview") }),
      ticket: 1,
    };
    mountedSrc = url;
    if (previous) {
      pending = layer;
      // A newer PDF may take this viewer over while it loads (`ticket`): then that load shows it, not this one.
      const fresh = layer.viewer;
      const ok = await whenEmbedPdfShown(el, scroll, () => pending !== layer || layer.ticket !== 1, 5000, new Set(), fresh ? () => requestEmbedPdfZoom(fresh, keptZoom) : undefined);
      if (!ok || pending !== layer || layer.ticket !== 1) return;
      swapTo(layer, previous, started, url);
      return;
    }
    host.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    shown = layer;
    shownSeq++;
    viewer = layer.viewer;
    unbindZoom();
    bindZoom(layer.viewer);
    onShown?.(url);
  }

  /** Shows `layer` in place of `previous`, which stays mounted and hidden as the spare for the next PDF. */
  function swapTo(layer: Layer, previous: Layer | null, started: number, url: string) {
    pending = null;
    layer.el.style.visibility = "";
    if (previous) previous.el.style.visibility = "hidden";
    dropLayer(spare);
    spare = previous;
    // Duration only: how long a new PDF took to replace the shown one.
    console.info(`[preview] swap ${Math.round(performance.now() - started)} ms`);
    shown = layer;
    shownSeq++;
    viewer = layer.viewer;
    unbindZoom();
    bindZoom(layer.viewer);
    onShown?.(url);
  }

  /** The shown layer's locator, created on first use; the hidden pending layer never takes clicks. */
  async function locatorOf(layer: Layer | null): Promise<PageLocator | null> {
    if (!layer?.viewer) return null;
    if (!layer.locator) {
      const { embedPdfPageLocator } = await import("#lib/pdf/embedpdf");
      layer.locator ??= embedPdfPageLocator(layer.viewer, layer.el).catch(() => null);
    }
    return layer.locator;
  }

  /** Bumped on every swap and zoom change, so the edit layer places its marks against the layer now shown. */
  let shownSeq = $state(0);
  let scrollerOf: ((target: Element) => HTMLElement | null) | null = null;

  function bindZoom(v: EmbedPdfContainer | null) {
    if (!v) return;
    v.registry.then((reg) => {
      if (viewer !== v) return;
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
                  shownSeq++;
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

  // `containerEl` exists only after first render, so this also covers mount-on-first-render.
  $effect(() => {
    const el = containerEl;
    const url = src;
    const mounted = mountedSrc;
    if (el && url && url !== mounted) {
      untrack(() => mount(url));
    } else if (el && !url && mounted) {
      untrack(() => destroy());
    }
  });

  // Keep an already mounted viewer in sync when the app theme flips.
  $effect(() => {
    const v = viewer;
    const th = effectiveTheme;
    untrack(() => {
      v?.setTheme(th);
      pending?.viewer?.setTheme(th);
    });
  });

  onDestroy(() => {
    destroy();
  });
</script>

<!-- The host is absolutely positioned so it always has a real height: EmbedPDF's first zoom fit needs one, and a content-sized host stayed blank for good (issue #93). -->
<div class="relative h-full min-h-40 w-full">
  <div bind:this={containerEl} class="embed-pdf-viewer absolute inset-0 flex"></div>
  {#if edit && containerEl && src}
    <PageEditLayer
      host={containerEl}
      locate={() => locatorOf(shown)}
      scroller={() => (shown && scrollerOf ? scrollerOf(shown.el) : null)}
      version={shownSeq}
      {edit}
    />
  {/if}
  {#if src}
    <ZoomOverlay bind:this={overlay} percent={currentZoomPercent} onZoom={setZoom} />
  {/if}
</div>

<style>
  /* The custom element EmbedPDF mounts (<embedpdf-container>) has no intrinsic size; make it fill this wrapper. */
  .embed-pdf-viewer :global(embedpdf-container) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
