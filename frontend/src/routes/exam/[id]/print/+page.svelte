<script lang="ts">
  // The Print step (issue #212): the print plan with its jobs and ticks beside the compiled exam (the Exam tab's compile card).
  import { page } from "$app/state";
  import { untrack } from "svelte";
  import { browser } from "$app/env";
  import { get } from "svelte/store";
  import { buildExamItems, loadExamCompileContext, type ExamCompileContext } from "#lib/grading/omrTemplatePrep";
  import { resolveMcExercises } from "#lib/grading/mcExerciseHash";
  import { examHasWithheldCode, getCurrentExamVariant } from "#lib/exam/examPreview";
  import { saveExamLayout, withSavedExam, type ExamLayoutPatch } from "#lib/exam/saveExamLayout";
  import { contentStamp } from "#lib/exam/examChecks";
  import { examChecksState } from "#lib/stores/shell";
  import { copiesUnavailable, loadStickerEntries } from "#lib/sharing/stickerEntries";
  import { examBaseMinutes } from "#lib/students/timeExtension";
  import type { StickerEntry } from "#lib/qr/stickerSheet";
  import { downloadBlob } from "#lib/utils/download";
  import { examFileName, FILE_KIND } from "#lib/export/fileName";
  import { awaitSessionReady, sessionStore } from "#lib/stores/session";
  import { createLoadGuard } from "#lib/utils/loadGuard";
  import ExamPreviewPanel, { type ExamPreviewStatus } from "#lib/components/exam/ExamPreviewPanel.svelte";
  import PrintPlan, { type PrintPreviews } from "#lib/components/exam/PrintPlan.svelte";
  import { printSettingsOf } from "#lib/exam/printLayout";
  import ExamPageHeader from "#lib/components/exam/ExamPageHeader.svelte";
  import { t, translate } from "#lib/i18n";
  import { Alert, PageShell } from "#lib/components/ui";
  import OmrPinList from "#lib/components/exam/OmrPinList.svelte";
  import { computeOmrTemplateHash } from "#lib/grading/omrTemplatePrep";
  import { deleteOmrTemplatePin, listOmrTemplatePins, pinOmrTemplate } from "#lib/grading/omrTemplatePins";
  import type { OmrPinSource, OmrTemplateCandidate } from "#lib/grading/omrTemplateChoice";

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
  const paneTitle = { exam: "exam.print.job.examBooklet", qr: "exam.print.job.qr", copies: "exam.print.job.copies", copiesA3: "exam.print.job.copiesA3", extra: "exam.print.extra.title" } as const;
  const paneKind = { exam: FILE_KIND.booklet, qr: FILE_KIND.qr, copies: FILE_KIND.copies, copiesA3: FILE_KIND.copiesA3, extra: FILE_KIND.extraSheet } as const;
  let extraPanes = $derived(
    (["exam", "qr", "copies", "copiesA3", "extra"] as const).flatMap((job) =>
      shown?.jobs[job] ? [{ id: job, title: $t(paneTitle[job]), url: shown.jobs[job] ?? null, fileName: ctx ? examFileName(ctx.exam, [paneKind[job]], "pdf") : undefined }] : []
    )
  );

  const key = () => get(sessionStore).sessionKey;
  let examItems = $derived(ctx ? buildExamItems(ctx.exercises, ctx.mcGroups) : []);
  // Personalised copies work with and without Examance grading (issue #272); only exercises without their code block them.
  let copiesBlocked = $derived(ctx ? copiesUnavailable(ctx.exercises) : null);
  // Only a results-only import lacks the LaTeX to preview; an exam graded outside Examance still compiles (without scan aids).
  let resultsOnly = $derived(!!ctx && examHasWithheldCode(ctx.exercises));
  let hasMc = $derived(ctx ? resolveMcExercises(ctx.exercises, ctx.libraryExercises, ctx.mcGroups).length > 0 : false);
  // Pinned answer-sheet layouts (issue #239); exams graded outside Examance print no scan aids and get none.
  let pinnable = $derived(!!ctx && ctx.exam.digitalGrading !== false && !resultsOnly);
  let pinList = $state.raw<OmrTemplateCandidate[] | null>(null);
  let pinError = $state("");
  let currentHash = $state<string | undefined>(undefined);

  async function loadPins() {
    if (!ctx) return;
    const shown = ctx;
    try {
      const [pins, hash] = await Promise.all([listOmrTemplatePins(shown.exam.id, key()), computeOmrTemplateHash({ ...shown, examItems })]);
      if (ctx !== shown) return;
      [pinList, currentHash] = [pins, hash];
      pinError = "";
    } catch (err) {
      if (ctx !== shown) return;
      pinError = translate("exam.print.pins.loadFailed", { message: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Never blocks printing: a failed pin is reported under the jobs. */
  async function pin(source: OmrPinSource) {
    if (!ctx || !pinnable) return;
    const shown = ctx;
    try {
      const pinned = await pinOmrTemplate({ ...shown, examItems }, source, key());
      if (!pinned || ctx !== shown) return;
      currentHash = pinned.hash;
      if (!(pinList ?? []).some((p) => p.hash === pinned.hash)) await loadPins();
    } catch (err) {
      if (ctx !== shown) return;
      pinError = translate("exam.print.pins.pinFailed", { message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function removePin(hash: string) {
    await deleteOmrTemplatePin(examId, hash);
    pinList = (pinList ?? []).filter((p) => p.hash !== hash);
  }

  const loadGuard = createLoadGuard();

  async function load(id: string) {
    const isStale = loadGuard.begin();
    // The previous exam's data goes at once: nothing of it may be shown or saved under this exam's URL.
    ctx = null;
    entries = null;
    entriesError = "";
    pinList = null;
    pinError = "";
    loadError = "";
    await awaitSessionReady();
    let loaded: ExamCompileContext | null = null;
    try {
      loaded = await loadExamCompileContext(id, key());
      if (isStale()) return;
      ctx = loaded;
      if (!loaded) loadError = translate("exam.page.examNotFoundOrDeleted");
      else void loadPins();
    } catch (err) {
      if (isStale()) return;
      loadError = err instanceof Error ? err.message : String(err);
    }
    try {
      const found = await loadStickerEntries(id, key(), examBaseMinutes(loaded?.exam));
      if (!isStale()) entries = found;
    } catch (err) {
      // A failed read is reported, never shown as "no students yet".
      if (!isStale()) entriesError = err instanceof Error ? err.message : String(err);
    }
  }

  /** The compile card reloads the sources before compiling (they may have changed in another tab). */
  async function refreshSources() {
    const id = examId;
    const fresh = await loadExamCompileContext(id, key());
    if (fresh && id === examId && ctx?.exam.id === id) ctx = fresh;
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
    const next = withSavedExam(ctx, exam);
    if (!next) return;
    ctx = next;
    layoutVersion++;
    // The made PDFs and ticks are checked against the content stamp, which covers the print settings.
    const exercises = ctx.exercises;
    examChecksState.update((cs) => (cs && cs.examId === exam.id && cs.stamps ? { ...cs, stamps: { ...cs.stamps, content: contentStamp(exam, exercises) } } : cs));
  }

  async function downloadPdf(variant: "angabe" | "loesung") {
    const bytes = await currentPdf(variant);
    if (!ctx) return;
    const kind = variant === "angabe" ? FILE_KIND.exam : FILE_KIND.solution;
    downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), examFileName(ctx.exam, [kind], "pdf"));
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
        exam={ctx.exam}
        exerciseCount={ctx.exercises.length}
        {entries}
        {entriesError}
        {preview}
        {hasMc}
        copiesUnavailable={copiesBlocked}
        {loadExamPdf}
        {downloadPdf}
        {compile}
        print={printSettingsOf(ctx.exam)}
        onPrintChange={savePrint}
        onPin={pin}
        bind:shown
      >
        {#snippet pins()}
          {#if pinnable}<OmrPinList pins={pinList} error={pinError} {currentHash} onRemove={removePin} />{/if}
        {/snippet}
      </PrintPlan>
      <div class="min-w-0 xl:contents">
        {#if resultsOnly}
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
