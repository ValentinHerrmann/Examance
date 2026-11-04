<script lang="ts">
  // The Archive tab of Results (issue #212): the overview results sheet and all graded papers as one print PDF, each with a preview, and the rest of an exam's raw export as checkboxes.
  import { page } from "$app/state";
  import { onDestroy, untrack } from "svelte";
  import { browser } from "$app/env";
  import { get } from "svelte/store";
  import { faFileZipper } from "@fortawesome/free-solid-svg-icons";
  import { t, translate } from "#lib/i18n";
  import { Alert, Button, Card, Checkbox, PageHeader, PageShell, Spinner, actionIcons } from "#lib/components/ui";
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

{#snippet pdfPane(busy: boolean, busyText: string, url: string | null, empty: string)}
  <div class="h-[60dvh] min-h-72 overflow-hidden rounded-md border border-line bg-surface-inset 2xl:h-[70dvh]">
    {#if busy}
      <div class="flex h-full items-center justify-center gap-2 p-4 text-center text-sm text-muted"><Spinner />{busyText}</div>
    {:else if url}
      <PdfEmbedViewer src={url} />
    {:else if empty}
      <div class="flex h-full items-center justify-center p-4 text-center text-sm text-muted">{empty}</div>
    {/if}
  </div>
{/snippet}

<PageShell width="fluid">
  <PageHeader title={$t("exam.archive.title")} subtitle={$t("exam.archive.intro")} helpTopic="stats" />

  {#if loadError}
    <Alert severity="danger">{loadError}</Alert>
  {:else if !ready}
    <div class="text-muted">{$t("exam.page.loading")}</div>
  {:else}
    <div class="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(20rem,0.8fr)]">
      <Card title={$t("exam.archive.sheetTitle")} class="min-w-0">
        <p class="mt-0 mb-4 text-sm text-muted">{$t("exam.archive.sheetIntro")}</p>
        {#if sheetError}<Alert severity="danger" class="mb-4">{sheetError}</Alert>{/if}
        {@render pdfPane(sheetBusy, $t("exam.archive.sheetBusy"), sheetUrl, "")}
        <div class="mt-4 flex flex-wrap gap-2">
          {#if sheetUrl}
            <Button icon={actionIcons.download} href={sheetUrl} download={`${fileTitle} – ${$t("exam.archive.sheetFile")}.pdf`}>{$t("exam.archive.sheetDownload")}</Button>
          {/if}
          <Button variant="outlined" severity="secondary" loading={sheetBusy} disabled={sheetBusy} onClick={() => renderSheet(examId)}>{$t("exam.archive.sheetRefresh")}</Button>
        </div>
      </Card>

      <Card title={$t("exam.archive.gradedTitle")} class="min-w-0">
        <p class="mt-0 mb-3 text-sm text-muted">{$t("exam.archive.gradedIntro")}</p>
        <Checkbox class="mb-4" bind:checked={duplex} disabled={gradedBusy} label={$t("exam.archive.gradedDuplex")} />
        {#if gradedError}<Alert severity="danger" class="mb-4">{gradedError}</Alert>{/if}
        {#if gradedBusy}<ExportProgressBar class="mb-3" step={$t("exam.archive.gradedBusy")} fraction={gradedFraction} />{/if}
        {@render pdfPane(gradedBusy, $t("exam.archive.gradedBusy"), gradedUrl, gradedNone ? $t("exam.archive.gradedNone") : $t("exam.archive.gradedEmpty"))}
        {#if gradedWarnings.length}
          <Alert severity="warning" class="mt-4" title={$t("export.dialog.doneWithWarnings")}>
            <ul class="list-disc pl-5">{#each gradedWarnings as w}<li>{w}</li>{/each}</ul>
          </Alert>
        {/if}
        <div class="mt-4 flex flex-wrap items-center gap-2">
          {#if gradedUrl}
            <Button icon={actionIcons.download} href={gradedUrl} download={`${fileTitle} – ${$t("exam.archive.gradedFile")}.pdf`}>{$t("exam.archive.gradedDownload")}</Button>
            <span class="text-xs text-muted">{$t("exam.archive.gradedPages", { count: gradedPages })}</span>
          {/if}
          <Button variant={gradedUrl ? "outlined" : "solid"} severity={gradedUrl ? "secondary" : "primary"} icon={actionIcons.print} loading={gradedBusy} disabled={gradedBusy} onClick={renderGraded}>
            {gradedUrl ? $t("exam.archive.gradedRecreate") : $t("exam.archive.gradedCreate")}
          </Button>
        </div>
      </Card>

      <Card title={$t("exam.archive.zipTitle")} class="min-w-0 lg:col-span-2 2xl:col-span-1">
        <p class="mt-0 mb-4 text-sm text-muted">{$t("exam.archive.zipIntro")}</p>
        <Alert severity="warning" class="mb-4">{$t("export.exam.notice")}</Alert>
        <ExportOptionList {options} bind:checked disabled={running} />
        {#if running}<ExportProgressBar class="mt-4" {step} {fraction} />{/if}
        {#if error}<Alert severity="danger" class="mt-4">{error}</Alert>{/if}
        {#if done && warnings.length}
          <Alert severity="warning" class="mt-4" title={$t("export.dialog.doneWithWarnings")}>
            <ul class="list-disc pl-5">{#each warnings as w}<li>{w}</li>{/each}</ul>
          </Alert>
        {/if}
        <div class="mt-4 flex justify-end">
          <Button icon={faFileZipper} loading={running} disabled={running || selected.size === 0} onClick={download}>{$t("export.dialog.download")}</Button>
        </div>
      </Card>
    </div>
  {/if}
</PageShell>
