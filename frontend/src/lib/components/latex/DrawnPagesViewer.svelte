<script lang="ts">
  // Drawn pages (issue #352): the exercise editor's pages as the browser engine drew them, stacked; a page it could not draw exactly (or one zoomed in past its drawing) shows from the PDF via pdf.js. Clicks and the caret go through the same `PageEditLayer` as EmbedPDF.
  import { onDestroy, untrack } from "svelte";
  import { t } from "#lib/i18n";
  import type { PageLocator } from "#lib/pdf/embedpdf";
  import { pdfPageSizes, renderPdfPage } from "#lib/pdf/renderPages";
  import { wheelZoomTarget } from "#lib/pdf/wheelZoom";
  import { nextStamp, type DrawnPages } from "#lib/latex/drawnPages.svelte";
  import PageEditLayer, { type PageEditProps } from "#lib/components/latex/PageEditLayer.svelte";
  import ZoomOverlay, { type ZoomChoice } from "#lib/components/pdf/ZoomOverlay.svelte";

  interface Props {
    /** URL of the compile's PDF: pages it could not draw come from it. */
    src?: string | null;
    pages: DrawnPages;
    edit?: PageEditProps;
    /** The pane now answers clicks with the result of the PDF at `url` (`PreviewSync.shown`). */
    onShown?: (url: string) => void;
  }

  let { src = null, pages, edit = undefined, onShown = undefined }: Props = $props();

  /** Space between and around pages, in CSS pixels. */
  const GAP = 8;
  const A4 = { width: 595.276, height: 841.89 };

  let scrollerEl: HTMLDivElement | undefined = $state();
  let viewWidth = $state(0);
  let viewHeight = $state(0);
  /** Fit width or page, or CSS pixels per bp. */
  let zoom = $state<ZoomChoice | number>("fit-width");
  let pdf = $state.raw<{ url: string; bytes: Uint8Array; sizes: { width: number; height: number }[]; stamp: number } | null>(null);
  /** Pages rendered from the PDF: image URL, the PDF's stamp and the width in device pixels. */
  let fromPdf = $state.raw<({ url: string; stamp: number; px: number } | undefined)[]>([]);
  let overlay: ReturnType<typeof ZoomOverlay> | undefined = $state();
  let pageEls: HTMLElement[] = $state([]);
  /** Bumped when page geometry changes, so the edit layer places its marks again. */
  let version = $state(0);

  let count = $derived(pages.count ?? Math.max(pages.pages.length, pdf?.sizes.length ?? 0));
  let sizes = $derived(Array.from({ length: count }, (_, i) => pages.pages[i] ?? pdf?.sizes[i] ?? A4));
  let maxWidth = $derived(Math.max(A4.width, ...sizes.map((s) => s.width)));
  let maxHeight = $derived(Math.max(A4.height, ...sizes.map((s) => s.height)));
  let fitWidth = $derived(viewWidth > 0 ? (viewWidth - 2 * GAP) / maxWidth : 1);
  let cssScale = $derived(scaleFor(zoom, fitWidth, (viewHeight - 2 * GAP) / maxHeight));
  let dpr = $derived(globalThis.devicePixelRatio || 1);

  /** CSS pixels per bp of a zoom choice, given the scale that fits the width and the one that fits the height. */
  function scaleFor(choice: typeof zoom, widthFit: number, heightFit: number): number {
    if (choice === "fit-width") return widthFit;
    if (choice === "fit-page") return Math.min(widthFit, heightFit);
    return choice === "actual" ? 1 : choice;
  }

  /** Which source each page shows: its drawing, unless the PDF's rendering is newer. */
  function shown(i: number): { kind: "drawn"; bitmap: ImageBitmap } | { kind: "pdf"; url: string } | null {
    const drawn = pages.pages[i];
    const rendered = fromPdf[i];
    if (drawn?.bitmap && (!rendered || rendered.stamp < drawn.stamp)) return { kind: "drawn", bitmap: drawn.bitmap };
    return rendered ? { kind: "pdf", url: rendered.url } : null;
  }

  /** Paints a drawn page into its canvas (the bitmap may be closed later; the canvas keeps the pixels). */
  function paint(canvas: HTMLCanvasElement, bitmap: ImageBitmap) {
    const draw = (b: ImageBitmap) => {
      canvas.width = b.width;
      canvas.height = b.height;
      canvas.getContext("2d")?.drawImage(b, 0, 0);
    };
    draw(bitmap);
    return { update: draw };
  }

  /** Renders from the PDF the pages that need it, one after another. */
  let rendering = false;
  async function renderMissing() {
    if (rendering || !pdf) return;
    rendering = true;
    try {
      for (let i = 0; i < count; i++) {
        const current: typeof pdf = pdf;
        if (!current || i >= current.sizes.length) break;
        const drawn = pages.pages[i];
        const px = Math.round(current.sizes[i].width * cssScale * dpr);
        const rendered = fromPdf[i];
        const sharpEnough = (scale: number) => scale >= cssScale * dpr * 0.9;
        const needed = !drawn?.bitmap || !sharpEnough(drawn.scale);
        if (!needed || (rendered && rendered.stamp === current.stamp && rendered.px >= px * 0.9)) continue;
        const url = await renderPdfPage(current.bytes, i + 1, px); // NOSONAR: one page at a time keeps the main thread responsive
        if (pdf !== current) break;
        const next = [...fromPdf];
        next[i] = { url, stamp: current.stamp, px };
        fromPdf = next;
      }
    } finally {
      rendering = false;
    }
  }

  async function loadPdf(url: string) {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    const sizes = await pdfPageSizes(bytes);
    if (src !== url) return;
    pdf = { url, bytes, sizes, stamp: nextStamp() };
    onShown?.(url);
  }

  function setZoom(choice: ZoomChoice) {
    zoom = choice;
  }

  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoom = wheelZoomTarget(cssScale, e);
    overlay?.show();
  }

  /** Two-finger pinch on touch screens; one finger keeps scrolling. */
  const touches = new Map<number, { x: number; y: number }>();
  let pinch: { distance: number; scale: number } | null = null;
  const spread = () => {
    const [a, b] = [...touches.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  function onPointerDown(e: PointerEvent) {
    if (e.pointerType !== "touch") return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) pinch = { distance: spread(), scale: cssScale };
  }
  function onPointerMove(e: PointerEvent) {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size === 2 && pinch.distance > 0) {
      zoom = Math.min(5, Math.max(0.25, (pinch.scale * spread()) / pinch.distance));
      overlay?.show();
    }
  }
  function onPointerUp(e: PointerEvent) {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = null;
  }

  /** Client points to page points (bp from the page's top left) and back, from the page elements as laid out now. */
  const locator: PageLocator = {
    pointAt(clientX, clientY) {
      for (let i = 0; i < pageEls.length; i++) {
        const el = pageEls[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const scale = r.width / sizes[i].width;
        const x = (clientX - r.left) / scale;
        const y = (clientY - r.top) / scale;
        if (x >= 0 && y >= 0 && x <= sizes[i].width && y <= sizes[i].height) return { page: i + 1, x, y };
      }
      return null;
    },
    clientOf(page, x, y) {
      const el = pageEls[page - 1];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const scale = r.width / sizes[page - 1].width;
      return { left: r.left + x * scale, top: r.top + y * scale, scale };
    },
  };

  let resize: ResizeObserver | null = null;
  onDestroy(() => resize?.disconnect());

  $effect.pre(() => {
    const el = scrollerEl;
    untrack(() => {
      resize?.disconnect();
      if (!el) return;
      resize = new ResizeObserver(() => {
        viewWidth = el.clientWidth;
        viewHeight = el.clientHeight;
      });
      resize.observe(el);
      el.addEventListener("wheel", onWheel, { passive: false });
    });
    return () => el?.removeEventListener("wheel", onWheel);
  });

  // A new PDF: its sizes, then the pages that need it.
  $effect.pre(() => {
    const url = src;
    untrack(() => {
      if (url && url !== pdf?.url) void loadPdf(url);
    });
  });

  // The scale the next compile draws at, and the pages to render from the PDF now.
  $effect.pre(() => {
    const scale = cssScale;
    const ratio = dpr;
    // Read only so the effect runs again when a drawn page or the PDF changes.
    const watched = [pages.pages, pdf];
    untrack(() => {
      pages.scale = scale * ratio;
      version++;
      if (watched.length) void renderMissing();
    });
  });
</script>

<div class="relative h-full min-h-40 w-full">
  <div
    bind:this={scrollerEl}
    class="drawn-pages absolute inset-0 overflow-auto"
    style="touch-action: pan-x pan-y; padding: {GAP}px;"
    role="region"
    aria-label={$t("common.pdfPreview")}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  >
    {#each sizes as size, i (i)}
      {@const view = shown(i)}
      <div
        bind:this={pageEls[i]}
        class="mx-auto bg-white shadow-sm"
        style="width: {size.width * cssScale}px; height: {size.height * cssScale}px; margin-bottom: {GAP}px;"
        role="img"
        aria-label={$t("common.pdfPage")}
        data-page={i + 1}
      >
        {#if view?.kind === "drawn"}
          <canvas class="block h-full w-full" use:paint={view.bitmap}></canvas>
        {:else if view?.kind === "pdf"}
          <img class="block h-full w-full" src={view.url} alt="" draggable="false" />
        {/if}
      </div>
    {/each}
  </div>
  {#if edit && scrollerEl && count > 0}
    <PageEditLayer host={scrollerEl} locate={async () => locator} scroller={() => scrollerEl ?? null} {version} {edit} />
  {/if}
  {#if count > 0}
    <ZoomOverlay bind:this={overlay} percent={Math.round(cssScale * 100)} onZoom={setZoom} />
  {/if}
</div>
