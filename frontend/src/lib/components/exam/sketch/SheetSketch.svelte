<script lang="ts" module>
  import { compileLayoutSample } from "#lib/exam/layoutSample";
  import { renderPdfPages, type RenderedPage } from "#lib/pdf/renderPages";

  // The sample is the same for every exam: compiled and rendered once per tab, shared by every Layout step.
  let sampleRun: Promise<RenderedPage[]> | null = null;
  function loadSample(): Promise<RenderedPage[]> {
    sampleRun ??= compileLayoutSample().then((r) => renderPdfPages(r.pdfBytes, 5));
    sampleRun.catch(() => (sampleRun = null));
    return sampleRun;
  }
</script>

<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { t } from "#lib/i18n";
  import { focusPageOf, SAMPLE_PAGES, sheetSketchOf, sheetsOf, type SketchPart } from "#lib/exam/sheetSketch";
  import { getLatestForSlot } from "#lib/latex/compileCache";
  import { pagesPerSheet } from "#lib/exam/printLayout";
  import type { ExamRecord } from "#lib/db/schema";
  import { minWidth } from "#lib/stores/viewport";
  import { fillViewport } from "#lib/utils/fillViewport";
  import { Button } from "#lib/components/ui";
  import { faArrowsRotate } from "@fortawesome/free-solid-svg-icons";
  import SketchPage from "./SketchPage.svelte";

  type Fields = Parameters<typeof sheetSketchOf>[0];

  /** The Layout step's preview (issue #272): a sample exam with every layout option drawn over it, one page large and every page as a thumbnail. */
  interface Props {
    examId: string;
    fields: Fields & Pick<ExamRecord, "printLayout">;
    hasLogo: boolean;
    /** The option element under the pointer or focus: the large page jumps to it and stresses it. */
    highlight?: SketchPart | null;
  }

  let { examId, fields, hasLogo, highlight = null }: Props = $props();

  let sample = $state.raw<RenderedPage[] | null>(null);
  let status = $state<"loading" | "ready" | "failed">("loading");
  let examPages = $state<number | null>(null);
  let focus = $state(1);
  const isXl = minWidth("xl", true);

  let model = $derived(sheetSketchOf(fields, hasLogo, sample?.length ?? SAMPLE_PAGES));
  let sheets = $derived(sheetsOf(model));
  let current = $derived(model.pages.find((p) => p.number === focus) ?? model.pages[0]!);
  const imageOf = (n: number) => (n <= (sample?.length ?? 0) ? sample![n - 1]! : null);
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

  onMount(() => {
    void load();
    void readExamPages();
  });

  let examSheets = $derived(examPages === null ? null : Math.ceil(examPages / pagesPerSheet(model.layout)));

  // The large page follows the hovered or focused option; leaving it keeps that page.
  $effect.pre(() => {
    const part = highlight;
    untrack(() => {
      if (part) focus = focusPageOf(part, model);
    });
  });
  // A page that no longer exists (fewer extra pages) falls back to the cover.
  $effect.pre(() => {
    const count = model.pages.length;
    untrack(() => {
      if (focus > count) focus = 1;
    });
  });
</script>

{#snippet large()}
  <SketchPage {model} page={current} image={imageOf(current.number)} {highlight} class="mx-auto block h-full max-h-full w-auto max-w-full rounded shadow-sm" />
{/snippet}

<figure class="m-0 flex min-w-0 flex-col gap-3">
  <figcaption class="flex flex-wrap items-baseline gap-x-2 text-sm">
    <span class="font-semibold text-content">{$t("exam.layout.sketch.title")}</span>
    <span class="text-xs text-muted">{$t("exam.layout.sketch.pageOf", { page: current.number, pages: model.pages.length, role: roleLabel(current.role) })}</span>
    {#if status === "loading"}<span class="text-xs text-muted">{$t("exam.layout.sketch.loading")}</span>{/if}
  </figcaption>

  {#if $isXl}
    <div class="min-h-0" use:fillViewport={{ min: 320 }}>{@render large()}</div>
  {:else}
    <div class="mx-auto w-full max-w-56 sm:max-w-xs">{@render large()}</div>
  {/if}

  <!-- Every page, grouped as printed; a click shows it large. -->
  <div class="overflow-x-auto pb-1">
    <ol class="m-0 flex list-none gap-3 p-0" aria-label={$t("exam.layout.sketch.pages")}>
      {#each sheets as sheet, s (s)}
        <li class="flex shrink-0 flex-col gap-1">
          <span class="text-xs text-muted">{$t(model.layout === "booklet" ? "exam.layout.sketch.sheetBooklet" : "exam.layout.sketch.sheetDuplex", { n: s + 1 })}</span>
          <div class="flex gap-1 rounded-md border border-line p-1">
            {#each sheet as page (page.number)}
              <button
                type="button"
                class="flex w-16 flex-col items-center gap-0.5 rounded p-0.5 text-xs {page.number === focus ? 'bg-highlight text-on-highlight' : 'text-muted hover:bg-surface-inset'}"
                aria-pressed={page.number === focus}
                title="{page.number} · {roleLabel(page.role)}"
                onclick={() => (focus = page.number)}
              >
                <SketchPage {model} {page} image={imageOf(page.number)} thumb class="w-full" />
                <span class="max-w-full truncate">{page.number} · {roleLabel(page.role)}</span>
              </button>
            {/each}
          </div>
        </li>
      {/each}
    </ol>
  </div>

  {#if status === "failed"}
    <p class="m-0 flex flex-wrap items-center gap-2 text-xs text-warning-fg">
      {$t("exam.layout.sketch.failed")}
      <Button size="sm" variant="outlined" severity="secondary" icon={faArrowsRotate} onClick={load}>{$t("exam.layout.sketch.retry")}</Button>
    </p>
  {/if}
  {#if examSheets !== null}
    <p class="m-0 text-xs text-content">{$t("exam.layout.sketch.yourExam", { pages: examPages ?? 0, sheets: examSheets })}</p>
  {/if}
  <p class="m-0 text-xs text-muted">{$t("exam.layout.sketch.note")}</p>
</figure>
