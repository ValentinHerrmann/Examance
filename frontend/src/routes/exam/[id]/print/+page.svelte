<script lang="ts">
  // The Print step (issue #212): the print plan with its jobs and ticks beside the compiled exam (the Exam tab's compile card).
  import { page } from "$app/state";
  import { untrack } from "svelte";
  import { browser } from "$app/env";
  import { get } from "svelte/store";
  import { buildExamItems, loadExamCompileContext, type ExamCompileContext } from "#lib/grading/omrTemplatePrep";
  import { resolveMcExercises } from "#lib/grading/mcExerciseHash";
  import { getCurrentExamPreview } from "#lib/exam/examPreview";
  import { copiesUnavailable, loadStickerEntries } from "#lib/sharing/stickerEntries";
  import type { StickerEntry } from "#lib/qr/stickerSheet";
  import { downloadBlob } from "#lib/components/stats/chartExport";
  import { slug } from "#lib/export/zip";
  import { awaitSessionReady, sessionStore } from "#lib/stores/session";
  import ExamPreviewPanel, { type ExamPreviewStatus } from "#lib/components/exam/ExamPreviewPanel.svelte";
  import PrintPlan from "#lib/components/exam/PrintPlan.svelte";
  import ExamPageHeader from "#lib/components/exam/ExamPageHeader.svelte";
  import { t, translate } from "#lib/i18n";
  import { Alert, PageShell } from "#lib/components/ui";

  let examId = $derived(page.params.id || "");
  let ctx = $state.raw<ExamCompileContext | null>(null);
  let loadError = $state("");
  let entries = $state.raw<StickerEntry[] | null>(null);
  let entriesError = $state("");
  let preview = $state<ExamPreviewStatus | undefined>(undefined);
  let compile = $state<(() => Promise<void>) | undefined>(undefined);
  // Sticker or copies PDFs made in the plan, shown as extra panes beside task sheet and solution.
  let jobUrls = $state<Partial<Record<"qr" | "copies", string>>>({});
  let extraPanes = $derived(
    (["qr", "copies"] as const).flatMap((job) => (jobUrls[job] ? [{ id: job, title: $t(`exam.print.job.${job}`), url: jobUrls[job] ?? null }] : [])),
  );

  const key = () => get(sessionStore).sessionKey;
  let examItems = $derived(ctx ? buildExamItems(ctx.exercises, ctx.mcGroups) : []);
  let withheld = $derived(ctx ? copiesUnavailable(ctx.exercises) : null);
  let hasMc = $derived(ctx ? resolveMcExercises(ctx.exercises, ctx.libraryExercises, ctx.mcGroups).length > 0 : false);
  let title = $derived(ctx?.exam.title || $t("exam.nav.examFallback"));

  async function load(id: string) {
    await awaitSessionReady();
    loadError = "";
    try {
      ctx = await loadExamCompileContext(id, key());
      if (!ctx) loadError = translate("exam.page.examNotFoundOrDeleted");
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
    try {
      entries = await loadStickerEntries(id, key());
    } catch (err) {
      // A failed read is reported, never shown as "no students yet".
      entriesError = err instanceof Error ? err.message : String(err);
    }
  }

  /** The compile card reloads the sources before compiling (they may have changed in another tab). */
  async function refreshSources() {
    const fresh = await loadExamCompileContext(examId, key());
    if (fresh) ctx = fresh;
  }

  /** The current compiled sheets; the job rows only offer them while the preview is current. */
  async function currentPdfs() {
    if (!ctx) throw new Error(translate("exam.page.examNotFoundOrDeleted"));
    const cached = await getCurrentExamPreview({ ...ctx, examItems, key: key() });
    if (!cached || cached === "stale") throw new Error(translate("exam.print.ready.pdfStale"));
    return cached;
  }

  const loadExamPdf = async () => (await currentPdfs()).angabe.pdfBytes;

  async function downloadPdf(variant: "angabe" | "loesung") {
    const pdfs = await currentPdfs();
    const bytes = variant === "angabe" ? pdfs.angabe.pdfBytes : pdfs.loesung.pdfBytes;
    const suffix = variant === "angabe" ? "" : `_${slug($t("exam.page.pdfPreview.titleLoesung"))}`;
    downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${slug(title)}${suffix}.pdf`);
  }

  $effect.pre(() => {
    const id = examId;
    if (browser && id) untrack(() => void load(id));
  });
</script>

<PageShell width="fluid">
  <ExamPageHeader {examId} step="print" title={$t("exam.sidebar.print")} helpTopic="examCreation" />

  {#if loadError}
    <Alert severity="danger" class="mb-6">{loadError}</Alert>
  {:else if !ctx}
    <div class="text-muted">{$t("exam.page.loading")}</div>
  {:else}
    <!-- One row: the plan beside the PDFs; the compile button sits in the plan's first job (issue #212). -->
    <div class="grid min-w-0 grid-cols-1 items-start gap-x-6 gap-y-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <PrintPlan
        class="xl:col-start-1 xl:row-start-1"
        {examId}
        examTitle={ctx.exam.title ?? ""}
        exerciseCount={ctx.exercises.length}
        {entries}
        {entriesError}
        {preview}
        {hasMc}
        copiesUnavailable={withheld}
        {loadExamPdf}
        {downloadPdf}
        {compile}
        onJobPdf={(job, url) => {
          if (job === "qr" || job === "copies") jobUrls = { ...jobUrls, [job]: url ?? undefined };
        }}
      />
      <div class="min-w-0 xl:contents">
        {#if withheld}
          <Alert class="xl:col-start-2 xl:row-start-1" severity="info" title={$t("exam.resultsOnly.badge")}>{$t("exam.resultsOnly.noCompile")}</Alert>
        {:else}
          <ExamPreviewPanel
            exam={ctx.exam}
            exercises={ctx.exercises}
            libraryExercises={ctx.libraryExercises}
            mcGroups={ctx.mcGroups}
            {examItems}
            loaded
            layoutVersion={0}
            {refreshSources}
            toolbar={false}
            {extraPanes}
            bind:compile
            bind:status={preview}
          />
        {/if}
      </div>
    </div>
  {/if}
</PageShell>
