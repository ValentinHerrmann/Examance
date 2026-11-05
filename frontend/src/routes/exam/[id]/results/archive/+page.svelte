<script lang="ts">
  // The Archive tab of Results (issue #212): the overview results sheet and all graded papers as one print PDF, each with a preview, and the rest of an exam's raw export as checkboxes.
  import { page } from "$app/state";
  import ExamPageHeader from "#lib/components/exam/ExamPageHeader.svelte";
  import { onDestroy, untrack } from "svelte";
  import { browser } from "$app/env";
  import { get } from "svelte/store";
  import { faArrowsRotate, faFileCirclePlus, faFileZipper, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
  import { t, translate } from "#lib/i18n";
  import { Alert, Button, Checkbox, Icon, PageShell, Spinner, actionIcons } from "#lib/components/ui";
  import InfoTip from "#lib/components/help/InfoTip.svelte";
  import PdfEmbedViewer from "#lib/components/PdfEmbedViewer.svelte";
  import ExportOptionList from "#lib/components/export/ExportOptionList.svelte";
  import ExportProgressBar from "#lib/components/export/ExportProgressBar.svelte";
  import { loadExamEncrypted, loadExamExercisesEncrypted } from "#lib/db/dbEncryption";
  import { examHasWithheldCode } from "#lib/exam/examPreview";
  import { renderCombinedGradedPdf, renderExamSummaryPdf, runExamExport } from "#lib/export/examExport";
  import { examExportOptions } from "#lib/export/examExportOptions";
  import { runZipExport } from "#lib/export/runZipExport";
  import { pdfBytesToUrl } from "#lib/latex/pdfPreview";
  import { awaitSessionReady, sessionStore } from "#lib/stores/session";

  let examId = $derived(page.params.id || "");
  let title = $state("");
  let withheld = $state(false);
  let ready = $state(false);
  let loadError = $state("");
  let sheetUrl = $state<string | null>(null);
  let sheetBusy = $state(false);
  let sheetError = $state("");
  let gradedUrl = $state<string | null>(null);
  let gradedPages = $state(0);
  let gradedBusy = $state(false);
  let gradedFraction = $state<number | null>(null);
  let gradedError = $state("");
  let gradedWarnings = $state<string[]>([]);
  let gradedNone = $state(false);
  let duplex = $state(true);
  let checked = $state<Record<string, boolean>>({});
  let running = $state(false);
  let step = $state("");
  let fraction = $state<number | null>(null);
  let error = $state("");
  let warnings = $state<string[]>([]);
  let done = $state(false);

  let options = $derived(examExportOptions(withheld, $t));
  let selected = $derived(new Set(options.filter((o) => !o.disabled && checked[o.key]).map((o) => o.key)));
  let fileTitle = $derived(title || translate("dashboard.examList.untitledExam"));

  function revoke() {
    if (sheetUrl) URL.revokeObjectURL(sheetUrl);
    sheetUrl = null;
  }
  function revokeGraded() {
    if (gradedUrl) URL.revokeObjectURL(gradedUrl);
    gradedUrl = null;
  }
  onDestroy(() => {
    revoke();
    revokeGraded();
  });

  async function load(id: string) {
    await awaitSessionReady();
    const key = get(sessionStore).sessionKey;
    if (!key) return;
    try {
      const exam = await loadExamEncrypted(id, key);
      title = exam?.title ?? "";
      withheld = examHasWithheldCode(await loadExamExercisesEncrypted(id, key));
      checked = Object.fromEntries(examExportOptions(withheld, (k) => k).map((o) => [o.key, !o.disabled]));
      ready = true;
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
      return;
    }
    await renderSheet(id);
  }

  async function renderSheet(id: string) {
    sheetBusy = true;
    sheetError = "";
    try {
      const bytes = await renderExamSummaryPdf(id);
      if (id !== examId) return;
      revoke();
      sheetUrl = pdfBytesToUrl(bytes);
    } catch (err) {
      sheetError = err instanceof Error ? err.message : String(err);
    } finally {
      sheetBusy = false;
    }
  }

  /** On demand only: it decrypts and renders every scan. */
  async function renderGraded() {
    const id = examId;
    gradedBusy = true;
    gradedError = "";
    gradedWarnings = [];
    gradedNone = false;
    gradedFraction = null;
    try {
      const res = await renderCombinedGradedPdf(id, { duplex, progress: (d, total) => (gradedFraction = total ? d / total : null) });
      if (id !== examId) return;
      revokeGraded();
      gradedUrl = res.pdf ? pdfBytesToUrl(res.pdf) : null;
      gradedPages = res.pageCount;
      gradedNone = !res.pdf;
      gradedWarnings = res.warnings;
    } catch (err) {
      gradedError = err instanceof Error ? err.message : String(err);
    } finally {
      gradedBusy = false;
    }
  }

  async function download() {
    running = true;
    done = false;
    error = "";
    warnings = [];
    try {
      warnings = await runZipExport((sel, progress) => runExamExport(examId, sel, progress), selected, (s, d, total) => {
        step = s;
        fraction = total ? Math.min(1, (d ?? 0) / total) : null;
      });
      done = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      running = false;
    }
  }

  $effect.pre(() => {
    const id = examId;
    if (browser && id && $sessionStore.sessionKey) untrack(() => void load(id));
  });
</script>

<!-- All three boxes share one structure (header row with the main action, one control row, then the body that fills the rest), so their contents start and end at the same height (issue #212). -->
{#snippet box(title: string, intro: string, action: import("svelte").Snippet, controls: import("svelte").Snippet, body: import("svelte").Snippet, cls = "")}
  <section class="flex min-h-0 min-w-0 flex-col gap-3 rounded-xl bg-surface-raised p-4 shadow-sm {cls}">
    <header class="flex min-h-9 flex-wrap items-center justify-between gap-2">
      <div class="flex min-w-0 items-center gap-2">
        <h2 class="m-0 truncate text-base font-semibold text-content">{title}</h2>
        {#if intro}<InfoTip text={intro} />{/if}
      </div>
      <div class="flex flex-wrap items-center gap-2">{@render action()}</div>
    </header>
    <div class="flex min-h-8 flex-wrap items-center gap-2 text-sm">{@render controls()}</div>
    <div class="flex min-h-0 flex-1 flex-col gap-3">{@render body()}</div>
  </section>
{/snippet}

{#snippet pdfPane(busy: boolean, busyText: string, url: string | null, empty: string)}
  <div class="min-h-72 flex-1 overflow-hidden rounded-md border border-line bg-surface-inset lg:min-h-[28rem]">
    {#if busy}
      <div class="flex h-full items-center justify-center gap-2 p-4 text-center text-sm text-muted"><Spinner />{busyText}</div>
    {:else if url}
      <PdfEmbedViewer src={url} />
    {:else if empty}
      <div class="flex h-full items-center justify-center p-4 text-center text-sm text-muted">{empty}</div>
    {/if}
  </div>
{/snippet}

{#snippet sheetAction()}
  {#if sheetUrl}
    <Button size="sm" iconOnly icon={actionIcons.download} href={sheetUrl} download={`${fileTitle} – ${$t("exam.archive.sheetFile")}.pdf`} ariaLabel={$t("exam.archive.sheetDownload")} title={$t("exam.archive.sheetDownload")} />
  {/if}
  <Button size="sm" variant="outlined" severity="secondary" iconOnly icon={faArrowsRotate} loading={sheetBusy} disabled={sheetBusy} ariaLabel={$t("exam.archive.sheetRefresh")} title={$t("exam.archive.sheetRefresh")} onClick={() => renderSheet(examId)} />
{/snippet}
{#snippet sheetControls()}{/snippet}
{#snippet sheetBody()}
  {#if sheetError}<Alert severity="danger">{sheetError}</Alert>{/if}
  {@render pdfPane(sheetBusy, $t("exam.archive.sheetBusy"), sheetUrl, "")}
{/snippet}

{#snippet gradedAction()}
  {#if gradedUrl}
    <Button size="sm" iconOnly icon={actionIcons.download} href={gradedUrl} download={`${fileTitle} – ${$t("exam.archive.gradedFile")}.pdf`} ariaLabel={$t("exam.archive.gradedDownload")} title={$t("exam.archive.gradedDownload")} />
  {/if}
  <Button
    size="sm"
    variant={gradedUrl ? "outlined" : "solid"}
    severity={gradedUrl ? "secondary" : "primary"}
    iconOnly
    icon={gradedUrl ? faArrowsRotate : faFileCirclePlus}
    loading={gradedBusy}
    disabled={gradedBusy}
    ariaLabel={gradedUrl ? $t("exam.archive.gradedRecreate") : $t("exam.archive.gradedCreate")}
    title={gradedUrl ? $t("exam.archive.gradedRecreate") : $t("exam.archive.gradedCreate")}
    onClick={renderGraded}
  />
{/snippet}
{#snippet gradedControls()}
  <Checkbox bind:checked={duplex} disabled={gradedBusy} label={$t("exam.archive.gradedDuplex")} />
  {#if gradedUrl}<span class="text-xs text-muted">{$t("exam.archive.gradedPages", { count: gradedPages })}</span>{/if}
{/snippet}
{#snippet gradedBody()}
  {#if gradedError}<Alert severity="danger">{gradedError}</Alert>{/if}
  {#if gradedBusy}<ExportProgressBar step={$t("exam.archive.gradedBusy")} fraction={gradedFraction} />{/if}
  {#if !gradedUrl && !gradedBusy && !gradedNone}
    <!-- Before the first run the pane itself offers the labelled button. -->
    <div class="flex min-h-72 flex-1 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-line-strong p-4 text-center text-sm text-muted lg:min-h-[28rem]">
      {$t("exam.archive.gradedEmpty")}
      <Button size="sm" icon={faFileCirclePlus} onClick={renderGraded}>{$t("exam.archive.gradedCreate")}</Button>
    </div>
  {:else}
    {@render pdfPane(gradedBusy, $t("exam.archive.gradedBusy"), gradedUrl, gradedNone ? $t("exam.archive.gradedNone") : "")}
  {/if}
  {#if gradedWarnings.length}
    <Alert severity="warning" title={$t("export.dialog.doneWithWarnings")}>
      <ul class="list-disc pl-5">{#each gradedWarnings as w}<li>{w}</li>{/each}</ul>
    </Alert>
  {/if}
{/snippet}

{#snippet zipAction()}
  <Button size="sm" iconOnly icon={faFileZipper} loading={running} disabled={running || selected.size === 0} ariaLabel={$t("exam.archive.zipDownload")} title={$t("exam.archive.zipDownload")} onClick={download} />
{/snippet}
{#snippet zipControls()}
  <span class="flex items-center gap-1.5 text-warning-fg"><Icon icon={faTriangleExclamation} />{$t("exam.archive.zipNoticeShort")}</span>
  <InfoTip text={$t("export.exam.notice")} />
{/snippet}
{#snippet zipBody()}
  <div class="min-h-0 flex-1 overflow-auto">
    <ExportOptionList {options} bind:checked disabled={running} />
  </div>
  {#if running}<ExportProgressBar {step} {fraction} />{/if}
  {#if error}<Alert severity="danger">{error}</Alert>{/if}
  {#if done && warnings.length}
    <Alert severity="warning" title={$t("export.dialog.doneWithWarnings")}>
      <ul class="list-disc pl-5">{#each warnings as w}<li>{w}</li>{/each}</ul>
    </Alert>
  {/if}
{/snippet}

<PageShell width="fluid">
  <ExamPageHeader {examId} step="results" title={$t("exam.archive.title")} hint={$t("exam.archive.intro")} helpTopic="stats" />

  {#if loadError}
    <Alert severity="danger">{loadError}</Alert>
  {:else if !ready}
    <div class="text-muted">{$t("exam.page.loading")}</div>
  {:else}
    <!-- From 2xl one row of fixed height: equal boxes; the PDFs and the option list fill and scroll inside. -->
    <div class="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 2xl:h-[max(32rem,calc(100dvh-15.5rem))] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(20rem,0.8fr)]">
      {@render box($t("exam.archive.sheetTitle"), $t("exam.archive.sheetIntro"), sheetAction, sheetControls, sheetBody)}
      {@render box($t("exam.archive.gradedTitle"), $t("exam.archive.gradedIntro"), gradedAction, gradedControls, gradedBody)}
      {@render box($t("exam.archive.zipTitle"), "", zipAction, zipControls, zipBody, "lg:col-span-2 2xl:col-span-1")}
    </div>
  {/if}
</PageShell>
