<script lang="ts">
  import { t } from "#lib/i18n";
  import type { SheetSketchModel, SketchPart } from "#lib/exam/sheetSketch";
  import SketchPage from "./SketchPage.svelte";

  /** The Layout step's live, content-free sketch of the printed pages (issue #272): every layout option shows here as it prints. */
  interface Props {
    model: SheetSketchModel;
    highlight?: SketchPart | null;
    class?: string;
  }

  let { model, highlight = null, class: className = "" }: Props = $props();

  let summary = $derived(
    [
      model.scanAids ? $t("exam.layout.sketch.sumScan") : $t("exam.layout.sketch.sumNoScan"),
      model.qr === "printed" ? $t("exam.layout.sketch.sumQrPrinted") : model.qr === "sticker" ? $t("exam.layout.sketch.sumQrSticker") : "",
      model.nameLine ? $t("exam.layout.sketch.sumName") : "",
      model.pageCodes ? $t("exam.layout.sketch.sumCodes") : "",
      model.pages.some((p) => p.stickerSpot) ? $t("exam.layout.sketch.sumSpots") : "",
      model.layout === "booklet" ? $t("exam.layout.sketch.sumBooklet") : $t("exam.layout.sketch.sumDuplex"),
    ]
      .filter(Boolean)
      .join(", "),
  );
</script>

<figure class="m-0 flex min-w-0 flex-col gap-2 {className}">
  <figcaption class="flex flex-wrap items-baseline gap-x-2 text-sm">
    <span class="font-semibold text-content">{$t("exam.layout.sketch.title")}</span>
    <span class="text-xs text-muted">{$t(model.layout === "booklet" ? "exam.layout.sketch.sheetsBooklet" : "exam.layout.sketch.sheetsDuplex", { sheets: model.sheets, pages: model.pages.length })}</span>
  </figcaption>
  <p class="sr-only">{summary}</p>
  <!-- Phones scroll the row; wider cards fit every page. -->
  <div class="overflow-x-auto">
    <ol class="m-0 grid min-w-[28rem] list-none gap-2 p-0 grid-cols-4">
      {#each model.pages as page (page.number)}
        <li class="min-w-0">
          <SketchPage {model} {page} {highlight} />
          <span class="mt-0.5 block text-center text-xs text-muted">{$t(`exam.layout.sketch.role.${page.role}`)}</span>
        </li>
      {/each}
    </ol>
  </div>
  <p class="m-0 text-xs text-muted">{$t("exam.layout.sketch.note")}</p>
</figure>
