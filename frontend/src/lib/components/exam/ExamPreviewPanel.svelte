<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { get } from "svelte/store";
  import type { ExamRecord, ExerciseRecord } from "#lib/db/schema";
  import type { McGroup } from "#lib/db/dbEncryption";
  import { prepareOmrTemplate, omrTemplateStatus, type ExamItemRef } from "#lib/grading/omrTemplatePrep";
  import { resolveMcExercises } from "#lib/grading/mcExerciseHash";
  import { compileFailure, type CompileFailure } from "#lib/latex/compileError";
  import CompileErrorHelp from "#lib/components/latex/CompileErrorHelp.svelte";
  import { compileExamPreview, getCurrentExamPreview } from "#lib/exam/examPreview";
  import { pdfBytesToUrl } from "#lib/latex/pdfPreview";
  import { getLatestForSlot } from "#lib/latex/compileCache";
  import { sessionStore } from "#lib/stores/session";
  import DualPdfPreview from "#lib/components/DualPdfPreview.svelte";
  import LayoutReportButton from "#lib/components/layout-report/LayoutReportButton.svelte";
  import { examReportFiles } from "#lib/layout-report/collect";
  import { t, translate } from "#lib/i18n";
  import { Alert, Button, Card, actionIcons } from "#lib/components/ui";

  /** The exam's compile card (issue #212): compile, task/solution preview, layout report, compile errors and the OMR template status. Never compiles on its own: an edit only marks the shown preview as outdated (issue #197). */
  interface Props {
    exam: ExamRecord;
    exercises: ExerciseRecord[];
    libraryExercises: ExerciseRecord[];
    mcGroups: McGroup[];
    /** The effective item order (vanished refs dropped). */
    examItems: ExamItemRef[];
    /** True once the page finished loading the exam's sources; the cached preview and OMR status are read then. */
    loaded: boolean;
    /** Bumped by the page on every edit that changes the printed exam. */
    layoutVersion: number;
    /** Reloads the sources into the page (they may have changed elsewhere, issue #135); the props carry the result. */
    refreshSources: () => Promise<void>;
    class?: string;
  }

  let { exam, exercises, libraryExercises, mcGroups, examItems, loaded, layoutVersion, refreshSources, class: className = "" }: Props = $props();

  let isPreviewLoading = $state(false);
  let compileNotice = $state("");
  let errorMsg = $state("");
  // The full LaTeX log of the compile that produced `message` (shown only while errorMsg is that message).
  let compileLog = $state<{ message: string; failure: CompileFailure } | null>(null);
  function rememberCompileLog(message: string, err: unknown) {
    const failure = compileFailure(err);
    compileLog = failure ? { message, failure } : null;
  }

  let isPreparingOmr = $state(false);
  let omrPrepareMessage = $state("");
  let omrStatus: "none" | "ready" | "stale" | "checking" = $state("checking");

  let previewPdfUrl: string | null = $state(null);
  let previewSolutionPdfUrl: string | null = $state(null);
  let showAngabePreview = $state(true);
  let showLoesungPreview = $state(false);
  /** The shown preview no longer matches the sources; never recompiled automatically, the user presses compile (issue #197). */
  let previewOutdated = $state(false);

  const key = () => get(sessionStore).sessionKey;
  const sources = () => ({ exam, exercises, libraryExercises, mcGroups, examItems });

  async function checkOmrStatus() {
    omrStatus = "checking";
    try {
      omrStatus = await omrTemplateStatus(sources(), key());
    } catch (err) {
      console.error("Failed to check OMR template status:", err);
      omrStatus = "none";
    }
  }

  /** Shows this session's last compile; one that no longer matches the sources is shown marked as outdated (issues #135, #197). */
  async function restoreCachedPreviews() {
    if (exercises.length === 0 && mcGroups.length === 0) return;
    let cached: Awaited<ReturnType<typeof getCurrentExamPreview>>;
    try {
      cached = await getCurrentExamPreview({ ...sources(), key: key() });
    } catch {
      return; // e.g. results-only import: nothing to preview
    }
    if (cached === null) {
      // Never compiled in this session; also drops a preview left over from the previously open exam.
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
      if (previewSolutionPdfUrl) URL.revokeObjectURL(previewSolutionPdfUrl);
      previewPdfUrl = previewSolutionPdfUrl = null;
      previewOutdated = false;
      return;
    }
    const id = exam.id;
    const shown =
      cached === "stale"
        ? {
            angabe: getLatestForSlot({ kind: "exam", id, variant: "angabe" }),
            loesung: getLatestForSlot({ kind: "exam", id, variant: "loesung" }),
          }
        : cached;
    previewOutdated = cached === "stale";
    if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
    previewPdfUrl = shown.angabe ? pdfBytesToUrl(shown.angabe.pdfBytes) : null;
    if (previewSolutionPdfUrl) URL.revokeObjectURL(previewSolutionPdfUrl);
    previewSolutionPdfUrl = shown.loesung ? pdfBytesToUrl(shown.loesung.pdfBytes) : null;
  }

  /** `quiet`: an exam without MC, whose template only fills score boxes; a failure is logged, not shown. */
  async function handlePrepareOmr(quiet = false) {
    if (!quiet) isPreparingOmr = true;
    if (!quiet) errorMsg = "";
    try {
      const result = await prepareOmrTemplate({
        examId: exam.id,
        ...sources(),
        key: key(),
        onProgress: (msg) => {
          if (!quiet) omrPrepareMessage = msg;
        },
      });
      if (quiet) {
        if (result.status === "stale") console.warn("[PrepareOMR]", result.message);
        return;
      }
      omrStatus = result.status;
      if (result.status === "stale") {
        omrPrepareMessage = "";
        errorMsg = result.message;
      } else {
        omrPrepareMessage = result.message;
      }
    } catch (err: any) {
      if (quiet) {
        console.warn("[PrepareOMR]", err);
        return;
      }
      errorMsg = err.message || translate("exam.page.omr.failedGeneric");
      rememberCompileLog(errorMsg, err);
      omrPrepareMessage = "";
    } finally {
      if (!quiet) isPreparingOmr = false;
    }
  }

  async function handlePreviewExam() {
    if (exercises.length === 0 && mcGroups.length === 0) return;
    isPreviewLoading = true;
    compileNotice = "";
    errorMsg = "";
    let compileSucceeded = false;
    const versionAtStart = layoutVersion;

    try {
      await refreshSources();
      const res = await compileExamPreview({
        ...sources(),
        key: key(),
        onStatus: (status) => {
          if (status === "downloading") compileNotice = translate("exam.page.preview.loadingCompiler");
          else if (status === "compiling") compileNotice = translate("exam.page.preview.compiling");
        },
      });

      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
      previewPdfUrl = pdfBytesToUrl(res.angabe.pdfBytes);
      if (previewSolutionPdfUrl) URL.revokeObjectURL(previewSolutionPdfUrl);
      previewSolutionPdfUrl = pdfBytesToUrl(res.loesung.pdfBytes);

      if (res.missingGraphics.length > 0) {
        errorMsg = translate("common.previewMissingGraphic", { name: res.missingGraphics[0] });
      }
      compileNotice = "";
      compileSucceeded = true;
      // An edit during the compile leaves the new preview marked as outdated.
      previewOutdated = layoutVersion !== versionAtStart;
    } catch (err: any) {
      errorMsg = translate("exam.page.preview.failed", {
        message: err.message || translate("exam.page.preview.unknownError"),
      });
      rememberCompileLog(errorMsg, err);
    } finally {
      isPreviewLoading = false;
    }

    // Refresh the scan template after every successful compile so it never drifts from the layout. Without MC it only serves the score boxes (issue #187), so it refreshes quietly.
    if (compileSucceeded && resolveMcExercises(exercises, libraryExercises, mcGroups).length > 0) {
      await handlePrepareOmr();
    } else if (compileSucceeded && exercises.length > 0) {
      await handlePrepareOmr(true);
    }
  }

  onDestroy(() => {
    if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
    if (previewSolutionPdfUrl) URL.revokeObjectURL(previewSolutionPdfUrl);
  });

  let loadedFor = "";
  // First load of an exam: show the cached preview and the OMR status.
  $effect.pre(() => {
    const id = exam.id;
    const ready = loaded;
    if (ready && loadedFor !== id) {
      loadedFor = id;
      untrack(() => {
        void checkOmrStatus();
        void restoreCachedPreviews();
      });
    }
  });

  let seenVersion: number | null = null;
  // A layout edit: re-check the OMR template and mark a shown preview as outdated (no auto-compile, issue #197).
  $effect.pre(() => {
    const version = layoutVersion;
    untrack(() => {
      if (seenVersion !== null && version !== seenVersion) {
        void checkOmrStatus();
        if (previewPdfUrl || previewSolutionPdfUrl) previewOutdated = true;
      }
      seenVersion = version;
    });
  });
</script>

{#snippet layoutReport()}
  <LayoutReportButton
    kind="exam"
    title={exam.title ?? ""}
    compileError={errorMsg || null}
    disabled={isPreviewLoading}
    collectFiles={() => examReportFiles({ ...sources(), key: key() }, previewPdfUrl, previewSolutionPdfUrl)}
  />
{/snippet}

<Card title={$t("exam.page.compileSection.heading")} class={className}>
  <p class="mb-4 text-sm text-muted">
    {$t("exam.page.compileSection.description")}
  </p>

  <div class="flex flex-wrap items-center gap-4">
    <Button
      icon={actionIcons.compile}
      onClick={handlePreviewExam}
      loading={isPreviewLoading || isPreparingOmr}
      disabled={isPreviewLoading || isPreparingOmr || exercises.length === 0}
      title={$t("exam.page.compileSection.liveTooltip")}
    >
      {isPreviewLoading
        ? $t("exam.page.preview.compilingPreviews")
        : isPreparingOmr
          ? $t("exam.page.omr.preparing")
          : $t("exam.page.preview.liveButton")}
    </Button>
  </div>

  {#if exercises.length === 0 && mcGroups.length === 0}
    <p class="mt-3 text-sm text-muted">{$t("exam.page.compileSection.emptyHint")}</p>
  {/if}

  {#if omrStatus === "stale"}
    <Alert severity="warning" class="mt-3">
      {$t("exam.page.omr.staleWarning")}
      {#snippet actions()}
        <Button
          size="sm"
          variant="outlined"
          severity="warning"
          icon={actionIcons.compile}
          onClick={async () => {
            await refreshSources();
            await handlePrepareOmr();
          }}
          disabled={isPreparingOmr}
        >
          {isPreparingOmr ? $t("exam.page.omr.refreshing") : $t("exam.page.omr.refreshNow")}
        </Button>
      {/snippet}
    </Alert>
  {/if}
  {#if omrPrepareMessage}
    <Alert severity="info" class="mt-3">{omrPrepareMessage}</Alert>
  {/if}

  {#if previewOutdated && (previewPdfUrl || previewSolutionPdfUrl)}
    <Alert severity="info" class="mt-3">{$t("exam.page.preview.outdated")}</Alert>
  {/if}
  {#if previewPdfUrl || previewSolutionPdfUrl}
    <div class="mt-4">
      <DualPdfPreview
        {previewPdfUrl}
        {previewSolutionPdfUrl}
        bind:showAngabePreview
        bind:showLoesungPreview
        titleAngabe={$t("exam.page.pdfPreview.titleAngabe")}
        titleLoesung={$t("exam.page.pdfPreview.titleLoesung")}
        height="550px"
        placeholderText={$t("exam.page.pdfPreview.placeholder")}
      >
        {#snippet footer()}{@render layoutReport()}{/snippet}
      </DualPdfPreview>
    </div>
  {/if}

  {#if compileNotice}
    <Alert severity="info" class="mt-3">{compileNotice}</Alert>
  {/if}
  {#if errorMsg}
    <Alert severity="danger" class="mt-4">
      <div class="max-h-72 overflow-auto font-mono break-all whitespace-pre-wrap">{errorMsg}</div>
      {#if compileLog && compileLog.message === errorMsg}<CompileErrorHelp failure={compileLog.failure} class="mt-2" />{/if}
    </Alert>
  {/if}
  {#if errorMsg && !previewPdfUrl && !previewSolutionPdfUrl}
    <div class="mt-2 flex justify-end">{@render layoutReport()}</div>
  {/if}
</Card>
