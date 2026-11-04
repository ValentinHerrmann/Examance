<script lang="ts">
  // The Archive tab of Results (issue #212): the overview results sheet with a preview, and the rest of an exam's raw export as checkboxes.
  import { page } from "$app/state";
  import { onDestroy, untrack } from "svelte";
  import { browser } from "$app/env";
  import { get } from "svelte/store";
  import { faFileZipper } from "@fortawesome/free-solid-svg-icons";
  import { t, translate } from "#lib/i18n";
  import { Alert, Button, Card, PageHeader, PageShell, Spinner, actionIcons } from "#lib/components/ui";
  import PdfEmbedViewer from "#lib/components/PdfEmbedViewer.svelte";
  import ExportOptionList from "#lib/components/export/ExportOptionList.svelte";
  import ExportProgressBar from "#lib/components/export/ExportProgressBar.svelte";
  import { loadExamEncrypted, loadExamExercisesEncrypted } from "#lib/db/dbEncryption";
  import { examHasWithheldCode } from "#lib/exam/examPreview";
  import { renderExamSummaryPdf, runExamExport } from "#lib/export/examExport";
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
  onDestroy(revoke);

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

<PageShell width="wide">
  <PageHeader title={$t("exam.archive.title")} subtitle={$t("exam.archive.intro")} helpTopic="stats" />

  {#if loadError}
    <Alert severity="danger">{loadError}</Alert>
  {:else if !ready}
    <div class="text-muted">{$t("exam.page.loading")}</div>
  {:else}
    <div class="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card title={$t("exam.archive.sheetTitle")}>
        <p class="mt-0 mb-4 text-sm text-muted">{$t("exam.archive.sheetIntro")}</p>
        {#if sheetError}
          <Alert severity="danger" class="mb-4">{sheetError}</Alert>
        {/if}
        <div class="h-[70dvh] min-h-72 overflow-hidden rounded-md border border-line bg-surface-inset">
          {#if sheetBusy}
            <div class="flex h-full items-center justify-center gap-2 text-sm text-muted"><Spinner />{$t("exam.archive.sheetBusy")}</div>
          {:else if sheetUrl}
            <PdfEmbedViewer src={sheetUrl} />
          {/if}
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          {#if sheetUrl}
            <Button icon={actionIcons.download} href={sheetUrl} download={`${fileTitle} – ${$t("exam.archive.sheetFile")}.pdf`}>{$t("exam.archive.sheetDownload")}</Button>
          {/if}
          <Button variant="outlined" severity="secondary" loading={sheetBusy} disabled={sheetBusy} onClick={() => renderSheet(examId)}>{$t("exam.archive.sheetRefresh")}</Button>
        </div>
      </Card>

      <Card title={$t("exam.archive.zipTitle")}>
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
