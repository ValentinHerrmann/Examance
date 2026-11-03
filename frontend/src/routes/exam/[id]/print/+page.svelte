<script lang="ts">
  // The Print step (issue #212): the exam PDFs with the scan template, and the students' QR codes (stickers, onto copies, key slips).
  import { page } from "$app/state";
  import { onDestroy, untrack } from "svelte";
  import { browser } from "$app/env";
  import { get } from "svelte/store";
  import { buildExamItems, loadExamCompileContext, omrTemplateStatus, prepareOmrTemplate, type ExamCompileContext, type OmrTemplateStatus } from "#lib/grading/omrTemplatePrep";
  import { compileExamPreview } from "#lib/exam/examPreview";
  import { pdfBytesToUrl } from "#lib/latex/pdfPreview";
  import { copiesUnavailable } from "#lib/sharing/stickerEntries";
  import { awaitSessionReady, sessionStore } from "#lib/stores/session";
  import StickerSheetForm from "#lib/components/sharing/StickerSheetForm.svelte";
  import ExamStepFooter from "#lib/components/exam/ExamStepFooter.svelte";
  import { t, translate } from "#lib/i18n";
  import { Alert, Button, Card, PageHeader, PageShell, actionIcons } from "#lib/components/ui";

  let examId = $derived(page.params.id || "");
  let ctx = $state.raw<ExamCompileContext | null>(null);
  let loadError = $state("");
  let omr = $state<OmrTemplateStatus | "checking">("checking");
  let busy = $state(false);
  let progress = $state("");
  let error = $state("");
  let taskUrl: string | null = $state(null);
  let solutionUrl: string | null = $state(null);

  const key = () => get(sessionStore).sessionKey;
  const withItems = (c: ExamCompileContext) => ({ ...c, examItems: buildExamItems(c.exercises, c.mcGroups) });
  let title = $derived(ctx?.exam.title || $t("exam.nav.examFallback"));
  let withheld = $derived(ctx ? copiesUnavailable(ctx.exercises) : null);

  async function load(id: string) {
    await awaitSessionReady();
    loadError = "";
    try {
      ctx = await loadExamCompileContext(id, key());
      if (!ctx) {
        loadError = translate("exam.page.examNotFoundOrDeleted");
        return;
      }
      omr = await omrTemplateStatus(withItems(ctx), key());
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
      omr = "none";
    }
  }

  function revoke() {
    if (taskUrl) URL.revokeObjectURL(taskUrl);
    if (solutionUrl) URL.revokeObjectURL(solutionUrl);
    taskUrl = solutionUrl = null;
  }

  /** Compiles from freshly read sources (the compile cache makes a repeat free) and refreshes the scan template, as the Exam page's compile does. */
  async function compile(): Promise<Uint8Array | null> {
    const fresh = await loadExamCompileContext(examId, key());
    if (!fresh) throw new Error(translate("exam.page.examNotFoundOrDeleted"));
    ctx = fresh;
    const res = await compileExamPreview({
      ...withItems(fresh),
      key: key(),
      onStatus: (status) => {
        if (status === "downloading") progress = translate("exam.page.preview.loadingCompiler");
        else if (status === "compiling") progress = translate("exam.page.preview.compiling");
      },
    });
    revoke();
    taskUrl = pdfBytesToUrl(res.angabe.pdfBytes);
    solutionUrl = pdfBytesToUrl(res.loesung.pdfBytes);
    if (fresh.exercises.length > 0) {
      const result = await prepareOmrTemplate({ examId, ...withItems(fresh), key: key(), onProgress: (msg) => (progress = msg) });
      omr = result.status;
      if (result.status === "stale") error = result.message;
    }
    return res.angabe.pdfBytes;
  }

  async function createPdfs() {
    busy = true;
    error = "";
    try {
      await compile();
    } catch (err) {
      error = translate("exam.print.failed", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      busy = false;
      progress = "";
    }
  }

  /** The printable student sheet for personalised copies (issue #211). */
  async function studentSheetPdf(): Promise<Uint8Array> {
    const pdf = await compile();
    if (!pdf) throw new Error(translate("exam.page.examNotFoundOrDeleted"));
    return pdf;
  }

  onDestroy(revoke);

  $effect.pre(() => {
    const id = examId;
    if (browser && id) untrack(() => void load(id));
  });
</script>

<PageShell width="wide">
  <PageHeader title={$t("exam.sidebar.print")} helpTopic="examCreation" />

  {#if loadError}
    <Alert severity="danger" class="mb-6">{loadError}</Alert>
  {:else if !ctx}
    <div class="text-muted">{$t("exam.page.loading")}</div>
  {:else}
    <div class="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <Card title={$t("exam.print.pdfsTitle")}>
        <p class="mt-0 mb-4 text-sm text-muted">{$t("exam.print.pdfsIntro")}</p>
        {#if withheld}
          <Alert severity="info" title={$t("exam.resultsOnly.badge")}>{$t("exam.resultsOnly.noCompile")}</Alert>
        {:else if ctx.exercises.length === 0}
          <p class="m-0 text-sm text-muted">{$t("exam.page.compileSection.emptyHint")}</p>
        {:else}
          <div class="flex flex-wrap items-center gap-2">
            <Button icon={actionIcons.compile} loading={busy} disabled={busy} onClick={createPdfs}>{$t("exam.print.preparePdfs")}</Button>
            {#if taskUrl}
              <Button variant="outlined" severity="secondary" icon={actionIcons.download} href={taskUrl} download={`${title}.pdf`}>{$t("exam.print.downloadTask")}</Button>
            {/if}
            {#if solutionUrl}
              <Button variant="outlined" severity="secondary" icon={actionIcons.download} href={solutionUrl} download={`${title} – ${$t("exam.page.pdfPreview.titleLoesung")}.pdf`}>{$t("exam.print.downloadSolution")}</Button>
            {/if}
          </div>
          {#if progress}<p class="mt-3 mb-0 text-sm text-muted" role="status">{progress}</p>{/if}
          {#if omr === "ready"}
            <Alert severity="success" class="mt-4">{$t("exam.print.omrReady")}</Alert>
          {:else if omr === "stale"}
            <Alert severity="warning" class="mt-4">{$t("exam.page.omr.staleWarning")}</Alert>
          {:else if omr === "none"}
            <Alert severity="info" class="mt-4">{$t("exam.print.omrNone")}</Alert>
          {/if}
        {/if}
        {#if error}<Alert severity="danger" class="mt-4">{error}</Alert>{/if}
      </Card>

      <Card title={$t("exam.print.qrTitle")}>
        <p class="mt-0 mb-4 text-sm text-muted">{$t("exam.print.qrIntro")}</p>
        <StickerSheetForm {examId} examTitle={ctx.exam.title} loadExamPdf={studentSheetPdf} copiesUnavailable={withheld} />
      </Card>
    </div>
  {/if}

  <ExamStepFooter {examId} step="print" />
</PageShell>
