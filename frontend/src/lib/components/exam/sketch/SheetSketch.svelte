<script lang="ts" module>
  import { compileLayoutSample, SAMPLE_MC_URI } from "#lib/exam/layoutSample";
  import { renderPdfPage, renderPdfPages, type RenderedPage } from "#lib/pdf/renderPages";

  interface Sample {
    bytes: Uint8Array;
    /** Thumbnails with sizes and link rects. */
    pages: RenderedPage[];
  }

  // The sample is the same for every exam: compiled once per tab, shared by every Layout step; large renders are cached per page and width.
  let sampleRun: Promise<Sample> | null = null;
  const largeRenders = new Map<string, Promise<string>>();
  function loadSample(): Promise<Sample> {
    sampleRun ??= compileLayoutSample().then(async (r) => ({ bytes: r.pdfBytes, pages: await renderPdfPages(r.pdfBytes) }));
    sampleRun.catch(() => (sampleRun = null));
    return sampleRun;
  }
  function largeRender(sample: Sample, n: number, widthPx: number): Promise<string> {
    const key = `${n}:${widthPx}`;
    let run = largeRenders.get(key);
    if (!run) {
      run = renderPdfPage(sample.bytes, n, widthPx);
      largeRenders.set(key, run);
      run.catch(() => largeRenders.delete(key));
    }
    return run;
  }
</script>

<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
  import { t } from "#lib/i18n";
  import { focusPageOf, pageElementsOf, SAMPLE_PAGES, sheetSketchOf, sheetsOf, type SketchPart } from "#lib/exam/sheetSketch";
  import { getLatestForSlot } from "#lib/latex/compileCache";
  import { pagesPerSheet } from "#lib/exam/printLayout";
  import type { ExamRecord } from "#lib/db/schema";
  import { fillViewport } from "#lib/utils/fillViewport";
  import { minWidth } from "#lib/stores/viewport";
  import { Button } from "#lib/components/ui";
  import { faArrowsRotate } from "@fortawesome/free-solid-svg-icons";
  import SketchPage from "./SketchPage.svelte";
  import PageInfo from "./PageInfo.svelte";
  import InfoTip from "#lib/components/help/InfoTip.svelte";

  type Fields = Parameters<typeof sheetSketchOf>[0];

  /** The Layout step's preview (issue #272): a sample exam with every layout option drawn over it; one page large with numbered callouts, an info panel beside it, and every page as a thumbnail. */
  interface Props {
    examId: string;
    fields: Fields & Pick<ExamRecord, "printLayout">;
    hasLogo: boolean;
    /** The option element under the pointer or focus: the large page jumps to it and stresses it. */
    highlight?: SketchPart | null;
  }

  let { examId, fields, hasLogo, highlight = null }: Props = $props();

  let sample = $state.raw<Sample | null>(null);
  let status = $state<"loading" | "ready" | "failed">("loading");
  let examPages = $state<number | null>(null);
  let focus = $state(1);
  /** The panel's own hover, which stresses an element without moving to another page. */
  let panelHighlight = $state<SketchPart | null>(null);
  let largeBox: HTMLElement | undefined = $state();
  let largeWidth = $state(0);
  let largeUrl = $state<{ page: number; url: string } | null>(null);
  const isXl = minWidth("xl", true);

  let model = $derived(sheetSketchOf(fields, hasLogo, sample?.pages.length ?? SAMPLE_PAGES));
  let sheets = $derived(sheetsOf(model));
  let current = $derived(model.pages.find((p) => p.number === focus) ?? model.pages[0]!);
  const thumbOf = (n: number) => sample?.pages[n - 1] ?? null;
  const hasMc = (n: number) => (sample ? !!sample.pages[n - 1]?.links.some((l) => l.uri === SAMPLE_MC_URI) : undefined);
  let shown = $derived(panelHighlight ?? highlight);
  let parts = $derived(pageElementsOf(model, current, hasMc(current.number)));
  let largeImage = $derived.by(() => {
    const thumb = thumbOf(current.number);
    if (!thumb) return null;
    return largeUrl?.page === current.number ? { ...thumb, url: largeUrl.url } : thumb;
  });
  const roleLabel = (role: string) => $t(`exam.layout.sketch.role.${role}` as "exam.layout.sketch.role.cover");

  async function load() {
    status = "loading";
    try {
      sample = await loadSample();
      status = "ready";
    } catch {
      status = "failed";
    }
  }

  /** The exam's own page count from its last cached preview (the Exam step's draft); nothing is compiled for it. */
  async function readExamPages() {
    const entry = getLatestForSlot({ kind: "exam", id: examId, variant: "draft" });
    if (!entry) return;
    try {
      const { PDFDocument } = await import("pdf-lib");
      examPages = (await PDFDocument.load(entry.pdfBytes.slice())).getPageCount();
    } catch {
      examPages = null;
    }
  }

  // The large page is rendered at the width it is shown at, so it stays sharp; widths are bucketed to avoid re-rendering on every pixel.
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  const observer =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(([entry]) => {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            const px = Math.round(((entry?.contentRect.width ?? 0) * (globalThis.devicePixelRatio || 1)) / 200) * 200;
            if (px > 0 && px !== largeWidth) largeWidth = px;
          }, 200);
        });
  onMount(() => {
    void load();
    void readExamPages();
  });
  onDestroy(() => {
    observer?.disconnect();
    clearTimeout(resizeTimer);
  });

  let examSheets = $derived(examPages === null ? null : Math.ceil(examPages / pagesPerSheet(model.layout)));

  // The large page follows the hovered or focused option; leaving it keeps that page.
  $effect.pre(() => {
    const part = highlight;
    untrack(() => {
      if (!part) return;
      const mcPage = part === "mcHint" ? model.pages.find((p) => hasMc(p.number))?.number : undefined;
      focus = mcPage ?? focusPageOf(part, model);
    });
  });
  // A page that no longer exists (fewer extra pages) falls back to the cover.
  $effect.pre(() => {
    const count = model.pages.length;
    untrack(() => {
      if (focus > count) focus = 1;
    });
  });
  // The page box changes element when the layout switches at xl.
  $effect.pre(() => {
    const box = largeBox;
    untrack(() => {
      if (!box || !observer) return;
      observer.disconnect();
      observer.observe(box);
    });
  });
  // Renders the shown sample page sharply once its width is known; the thumbnail stands in meanwhile.
  $effect.pre(() => {
    const s = sample;
    const n = current.number;
    const width = largeWidth;
    untrack(() => {
      if (!s || !width || n > s.pages.length) return;
      void largeRender(s, n, width)
        .then((url) => {
          if (current.number === n) largeUrl = { page: n, url };
        })
        .catch(() => {});
    });
  });
</script>

{#snippet large(fit: boolean)}
  <SketchPage {model} page={current} image={largeImage} highlight={shown} callouts={parts} class={fit ? "mx-auto block aspect-[210/297] h-full max-h-full w-auto max-w-full rounded shadow-sm" : "mx-auto block w-full rounded shadow-sm"} />
{/snippet}

{#snippet strip()}
  <!-- Every page, grouped as printed; a click shows it large. -->
  <div class="shrink-0 overflow-x-auto pb-1">
    <ol class="m-0 flex list-none gap-2 p-0" aria-label={$t("exam.layout.sketch.pages")}>
      {#each sheets as sheet, s (s)}
        <li class="flex shrink-0 gap-0.5 rounded-md border border-line p-0.5" title={$t(model.layout === "booklet" ? "exam.layout.sketch.sheetBooklet" : "exam.layout.sketch.sheetDuplex", { n: s + 1 })}>
          {#each sheet as page (page.number)}
            <button
              type="button"
              class="flex w-11 flex-col items-center gap-0.5 rounded p-0.5 text-xs {page.number === focus ? 'bg-highlight text-on-highlight' : 'text-muted hover:bg-surface-inset'}"
              aria-pressed={page.number === focus}
              aria-label="{page.number} · {roleLabel(page.role)}"
              title="{page.number} · {roleLabel(page.role)}"
              onclick={() => (focus = page.number)}
            >
              <SketchPage {model} {page} image={thumbOf(page.number)} thumb class="w-full" />
              <span>{page.number}</span>
            </button>
          {/each}
        </li>
      {/each}
    </ol>
  </div>
{/snippet}

{#snippet footer()}
  {#if status === "failed"}
    <p class="m-0 flex shrink-0 flex-wrap items-center gap-2 text-xs text-warning-fg">
      {$t("exam.layout.sketch.failed")}
      <Button size="sm" variant="outlined" severity="secondary" icon={faArrowsRotate} onClick={load}>{$t("exam.layout.sketch.retry")}</Button>
    </p>
  {/if}
  {#if examSheets !== null}
    <p class="m-0 shrink-0 text-xs text-content">{$t("exam.layout.sketch.yourExam", { pages: examPages ?? 0, sheets: examSheets })}</p>
  {/if}
{/snippet}

<!-- From xl the whole preview fills the screen beside the options and never scrolls (the page shrinks instead); narrower, it stacks and the page scrolls. -->
{#if $isXl}
  <figure class="m-0 flex min-h-0 min-w-0 flex-col gap-2" use:fillViewport={{ min: 320 }}>
    <figcaption class="flex shrink-0 flex-wrap items-center gap-x-2 text-sm">{@render caption()}</figcaption>
    <div class="grid min-h-0 flex-1 grid-cols-[auto_minmax(13rem,1fr)] gap-4">
      <div class="flex min-h-0 justify-center" bind:this={largeBox}>{@render large(true)}</div>
      <div class="min-h-0 overflow-y-auto pr-1"><PageInfo {model} {parts} bind:highlight={panelHighlight} /></div>
    </div>
    {@render strip()}
    {@render footer()}
  </figure>
{:else}
  <figure class="@container m-0 flex min-w-0 flex-col gap-3">
    <figcaption class="flex shrink-0 flex-wrap items-center gap-x-2 text-sm">{@render caption()}</figcaption>
    <div class="grid min-w-0 grid-cols-1 gap-4 @2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <!-- Phones and tablets: a page that leaves the options in reach below. -->
      <div class="mx-auto w-full max-w-64 min-w-0 sm:max-w-sm" bind:this={largeBox}>{@render large(false)}</div>
      <PageInfo {model} {parts} bind:highlight={panelHighlight} />
    </div>
    {@render strip()}
    {@render footer()}
  </figure>
{/if}

{#snippet caption()}
    <span class="font-semibold text-content">{$t("exam.layout.sketch.title")}</span>
    <InfoTip text={$t("exam.layout.sketch.note")} />
    <span class="text-xs text-muted">{$t("exam.layout.sketch.pageOf", { page: current.number, pages: model.pages.length, role: roleLabel(current.role) })}</span>
    {#if status === "loading"}<span class="text-xs text-muted">{$t("exam.layout.sketch.loading")}</span>{/if}
{/snippet}
