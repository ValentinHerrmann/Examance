<script lang="ts">
  // The Print step (issue #212): the print plan with its jobs and ticks beside the compiled exam (the Exam tab's compile card).
  import { page } from "$app/state";
  import { untrack } from "svelte";
  import { browser } from "$app/env";
  import { get } from "svelte/store";
  import { buildExamItems, loadExamCompileContext, type ExamCompileContext } from "#lib/grading/omrTemplatePrep";
  import { resolveMcExercises } from "#lib/grading/mcExerciseHash";
  import { getCurrentExamVariant } from "#lib/exam/examPreview";
  import { saveExamLayout, type ExamLayoutPatch } from "#lib/exam/saveExamLayout";
  import { contentStamp } from "#lib/exam/examChecks";
  import { examChecksState } from "#lib/stores/shell";
  import { copiesUnavailable, loadStickerEntries } from "#lib/sharing/stickerEntries";
  import type { StickerEntry } from "#lib/qr/stickerSheet";
  import { downloadBlob } from "#lib/components/stats/chartExport";
  import { slug } from "#lib/export/zip";
  import { awaitSessionReady, sessionStore } from "#lib/stores/session";
  import ExamPreviewPanel, { type ExamPreviewStatus } from "#lib/components/exam/ExamPreviewPanel.svelte";
  import PrintPlan, { type PrintPreviews } from "#lib/components/exam/PrintPlan.svelte";
  import { printSettingsOf } from "#lib/exam/printLayout";
  import ExamPageHeader from "#lib/components/exam/ExamPageHeader.svelte";
  import { t, translate } from "#lib/i18n";
  import { Alert, PageShell } from "#lib/components/ui";

  let examId = $derived(page.params.id || "");
  let ctx = $state.raw<ExamCompileContext | null>(null);
  let loadError = $state("");
  let entries = $state.raw<StickerEntry[] | null>(null);
  let entriesError = $state("");
  let preview = $state<ExamPreviewStatus | undefined>(undefined);
  let compile = $state<((opts?: { solution?: boolean }) => Promise<void>) | undefined>(undefined);
  // Bumped when the print settings change, so the preview marks itself outdated.
  let layoutVersion = $state(0);
  // Only what the plan prints: the planned sheets while current, made sticker or copies PDFs as extra panes.
  let shown = $state<PrintPreviews | undefined>(undefined);
  const paneTitle = { exam: "exam.print.job.examBooklet", qr: "exam.print.job.qr", copies: "exam.print.job.copies" } as const;
  let extraPanes = $derived((["exam", "qr", "copies"] as const).flatMap((job) => (shown?.jobs[job] ? [{ id: job, title: $t(paneTitle[job]), url: shown.jobs[job] ?? null }] : [])));

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

  /** One current compiled sheet; the job rows only offer it while it is current (the solution may be skipped). */
  async function currentPdf(variant: "angabe" | "loesung"): Promise<Uint8Array> {
    if (!ctx) throw new Error(translate("exam.page.examNotFoundOrDeleted"));
    const cached = await getCurrentExamVariant({ ...ctx, examItems, key: key() }, variant);
    if (!cached) throw new Error(translate("exam.print.ready.pdfStale"));
    return cached.pdfBytes;
  }

  const loadExamPdf = () => currentPdf("angabe");

  /** Print settings live on the exam (issue #220): the sheet's sticker spots and filler pages follow them, so the preview turns outdated. */
  async function savePrint(patch: ExamLayoutPatch) {
    if (!ctx) return;
    const exam = await saveExamLayout(ctx.exam, patch);
    ctx = { ...ctx, exam };
    layoutVersion++;
    // The made PDFs and ticks are checked against the content stamp, which covers the print settings.
    const exercises = ctx.exercises;
    examChecksState.update((cs) => (cs && cs.examId === exam.id && cs.stamps ? { ...cs, stamps: { ...cs.stamps, content: contentStamp(exam, exercises) } } : cs));
  }

  async function downloadPdf(variant: "angabe" | "loesung") {
    const bytes = await currentPdf(variant);
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
    <!-- One row: the plan beside the PDFs, which show only what the plan prints (issues #212, #220). -->
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
        print={printSettingsOf(ctx.exam)}
        onPrintChange={savePrint}
        bind:shown
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
            {layoutVersion}
            {refreshSources}
            toolbar={false}
            {extraPanes}
            sheets={{ angabe: shown?.angabe ?? false, loesung: shown?.loesung ?? false }}
            currentOnly
            emptyHint={$t("exam.print.previewEmpty")}
            bind:compile
            bind:status={preview}
          />
        {/if}
      </div>
    </div>
  {/if}
</PageShell>
