<script lang="ts">
  // Admin inbox of layout problem reports (issue #134). The GitHub text never carries the reporter.
  import { onDestroy, onMount } from "svelte";
  import { faArrowLeft, faCheck, faCopy, faDownload, faTrash, faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
  import { apiErrorMessage } from "#lib/api/client";
  import {
    deleteLayoutReport,
    getLayoutReport,
    getLayoutReportFile,
    listLayoutReports,
    resolveLayoutReport,
    type LayoutReportDetail,
    type LayoutReportFileInfo,
    type LayoutReportSummary,
  } from "#lib/api/layoutReports";
  import { layoutReportIssueUrl, layoutReportMarkdown } from "#lib/layout-report/markdown";
  import { repoUrl } from "#lib/stores/versionStore";
  import { t, translate } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { Alert, Badge, Button, ConfirmDialog, Field, Modal, TableScroller, Textarea } from "#lib/components/ui";
  import PdfEmbedViewer from "#lib/components/PdfEmbedViewer.svelte";

  interface Props {
    /** Reports the open count, for the tab badge. */
    onOpenCount?: ((count: number) => void) | undefined;
  }

  let { onOpenCount = undefined }: Props = $props();

  let filter: "open" | "done" = $state("open");
  let items: LayoutReportSummary[] = $state.raw([]);
  let loading = $state(true);
  let error = $state("");

  let detail: LayoutReportDetail | null = $state.raw(null);
  let markdown = $state("");
  let newIssueUrl = $state("");
  let pdfUrls: Record<string, string> = $state({});
  let shownPdfId: string | null = $state(null);
  let copied = $state(false);
  let busy = $state(false);
  let resolving = $state(false);
  let resolveNote = $state("");
  let deleting = $state(false);

  async function load() {
    loading = true;
    error = "";
    try {
      const page = await listLayoutReports(filter);
      items = page.items;
      onOpenCount?.(page.open_count);
    } catch (err) {
      error = translate("layoutReport.admin.loadFailed", { message: apiErrorMessage(err, "") });
    } finally {
      loading = false;
    }
  }

  function revokePdfs() {
    for (const url of Object.values(pdfUrls)) URL.revokeObjectURL(url);
    pdfUrls = {};
    shownPdfId = null;
  }

  async function fileBytes(report: LayoutReportDetail, file: LayoutReportFileInfo): Promise<ArrayBuffer> {
    return getLayoutReportFile(report.id, file.id);
  }

  async function openReport(id: string) {
    busy = true;
    error = "";
    copied = false;
    revokePdfs();
    try {
      const report = await getLayoutReport(id);
      const decoder = new TextDecoder();
      const texFiles = [];
      for (const file of report.files.filter((f) => f.mime_type === "text/x-tex")) {
        texFiles.push({ filename: file.filename, source: decoder.decode(await fileBytes(report, file)) });
      }
      const urls: Record<string, string> = {};
      for (const file of report.files.filter((f) => f.mime_type === "application/pdf")) {
        urls[file.id] = URL.createObjectURL(new Blob([await fileBytes(report, file)], { type: "application/pdf" }));
      }
      pdfUrls = urls;
      shownPdfId = report.files.find((f) => urls[f.id])?.id ?? null;
      markdown = layoutReportMarkdown(report, texFiles);
      newIssueUrl = layoutReportIssueUrl(repoUrl, report, texFiles);
      detail = report;
    } catch (err) {
      error = translate("layoutReport.admin.actionFailed", { message: apiErrorMessage(err, "") });
    } finally {
      busy = false;
    }
  }

  function back() {
    detail = null;
    revokePdfs();
    void load();
  }

  async function openFile(file: LayoutReportFileInfo, download: boolean) {
    if (!detail) return;
    try {
      const url = pdfUrls[file.id] ?? URL.createObjectURL(new Blob([await fileBytes(detail, file)], { type: file.mime_type }));
      if (download) {
        const a = document.createElement("a");
        a.href = url;
        a.download = file.filename;
        a.click();
      } else {
        window.open(url, "_blank", "noopener");
      }
      if (!pdfUrls[file.id]) setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      error = translate("layoutReport.admin.actionFailed", { message: apiErrorMessage(err, "") });
    }
  }

  async function copyMarkdown() {
    await navigator.clipboard.writeText(markdown);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  async function confirmResolve() {
    if (!detail) return;
    busy = true;
    try {
      await resolveLayoutReport(detail.id, resolveNote);
      resolving = false;
      resolveNote = "";
      back();
    } catch (err) {
      error = translate("layoutReport.admin.actionFailed", { message: apiErrorMessage(err, "") });
    } finally {
      busy = false;
    }
  }

  async function confirmDelete() {
    if (!detail) return;
    busy = true;
    try {
      await deleteLayoutReport(detail.id);
      deleting = false;
      back();
    } catch (err) {
      deleting = false;
      error = translate("layoutReport.admin.actionFailed", { message: apiErrorMessage(err, "") });
    } finally {
      busy = false;
    }
  }

  function setFilter(value: "open" | "done") {
    filter = value;
    void load();
  }

  onMount(load);
  onDestroy(revokePdfs);
</script>

{#if error}<Alert severity="danger" class="mb-4">{error}</Alert>{/if}

{#if detail}
  <div class="flex min-w-0 flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="text" icon={faArrowLeft} onClick={back}>{$t("layoutReport.admin.back")}</Button>
      <div class="ml-auto flex flex-wrap gap-2">
        {#if detail.status === "open"}
          <Button size="sm" icon={faCheck} disabled={busy} onClick={() => (resolving = true)}>{$t("layoutReport.admin.resolve")}</Button>
        {/if}
        <Button size="sm" variant="outlined" severity="danger" icon={faTrash} disabled={busy} onClick={() => (deleting = true)}>
          {$t("layoutReport.admin.delete")}
        </Button>
      </div>
    </div>

    <div class="rounded-md border border-line bg-surface-sunken p-3 text-sm">
      <p class="m-0 font-semibold">
        {$t("layoutReport.admin.reportedBy", { email: detail.reporter_email, date: $fmt.date(detail.created_at) })}
      </p>
      {#if detail.source_title}<p class="m-0 text-muted">{$t("layoutReport.admin.sourceTitle", { title: detail.source_title })}</p>{/if}
      <p class="m-0 text-muted">{$t("layoutReport.admin.reporterHint")}</p>
      {#if detail.resolved_at}
        <p class="mt-2 mb-0">{$t("layoutReport.admin.resolvedOn", { date: $fmt.date(detail.resolved_at) })}</p>
        {#if detail.resolution_note}<p class="m-0 whitespace-pre-wrap">{$t("layoutReport.admin.resolutionNote", { note: detail.resolution_note })}</p>{/if}
      {/if}
    </div>

    <div class="grid min-w-0 gap-4 lg:grid-cols-2">
      <div class="flex min-w-0 flex-col gap-3">
        <div>
          <h3 class="m-0 mb-1 text-sm font-semibold">{$t("layoutReport.admin.problem")}</h3>
          <p class="m-0 whitespace-pre-wrap break-words">{detail.problem}</p>
        </div>
        <div>
          <h3 class="m-0 mb-1 text-sm font-semibold">{$t("layoutReport.admin.expected")}</h3>
          <p class="m-0 whitespace-pre-wrap break-words">{detail.expected}</p>
        </div>
        {#if detail.compile_error}
          <div>
            <h3 class="m-0 mb-1 text-sm font-semibold">{$t("layoutReport.admin.compileError")}</h3>
            <pre class="m-0 max-h-52 overflow-auto rounded-md bg-surface-sunken p-2 text-xs whitespace-pre-wrap break-all">{detail.compile_error}</pre>
          </div>
        {/if}
        <div>
          <h3 class="m-0 mb-1 text-sm font-semibold">{$t("layoutReport.admin.files")}</h3>
          <ul class="m-0 flex list-none flex-col gap-1 p-0 text-sm">
            {#each detail.files as file (file.id)}
              <li class="flex min-w-0 flex-wrap items-center gap-2">
                <span class="min-w-0 break-all">{file.filename}</span>
                <span class="text-muted">({Math.max(1, Math.round(file.byte_size / 1024))} KB)</span>
                {#if pdfUrls[file.id]}
                  <Button size="sm" variant="text" pressed={shownPdfId === file.id} onClick={() => (shownPdfId = file.id)}>
                    {$t("layoutReport.admin.pdfPreview")}
                  </Button>
                {/if}
                <Button size="sm" variant="text" icon={faUpRightFromSquare} onClick={() => openFile(file, false)}>{$t("layoutReport.admin.openFile")}</Button>
                <Button size="sm" variant="text" icon={faDownload} onClick={() => openFile(file, true)}>{$t("layoutReport.admin.downloadFile")}</Button>
              </li>
            {/each}
          </ul>
        </div>
      </div>
      {#if shownPdfId && pdfUrls[shownPdfId]}
        <div class="h-[70dvh] min-w-0 overflow-hidden rounded-md border border-line">
          <PdfEmbedViewer src={pdfUrls[shownPdfId]} />
        </div>
      {/if}
    </div>

    {#if detail.allow_publication}
      <div class="flex min-w-0 flex-col gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="m-0 text-sm font-semibold">{$t("layoutReport.admin.githubTitle")}</h3>
          <div class="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outlined" icon={copied ? faCheck : faCopy} onClick={copyMarkdown}>
              {copied ? $t("layoutReport.admin.copied") : $t("layoutReport.admin.copy")}
            </Button>
            <Button size="sm" variant="outlined" icon={faUpRightFromSquare} href={newIssueUrl} target="_blank" rel="noopener noreferrer">
              {$t("layoutReport.admin.openIssue")}
            </Button>
          </div>
        </div>
        <Textarea value={markdown} rows={14} readonly class="font-mono text-xs" />
      </div>
    {:else}
      <Alert severity="warning">{$t("layoutReport.admin.publicationDenied")}</Alert>
    {/if}
  </div>
{:else}
  <div class="mb-3 flex gap-2">
    <Button size="sm" variant="outlined" pressed={filter === "open"} onClick={() => setFilter("open")}>{$t("layoutReport.admin.filterOpen")}</Button>
    <Button size="sm" variant="outlined" pressed={filter === "done"} onClick={() => setFilter("done")}>{$t("layoutReport.admin.filterDone")}</Button>
  </div>
  {#if loading}
    <p class="m-0 text-sm text-muted">{$t("admin.loading")}</p>
  {:else if items.length === 0}
    <p class="m-0 text-sm text-muted">{$t("layoutReport.admin.empty")}</p>
  {:else}
    <TableScroller>
      <table class="data-table data-table-hover">
        <tbody>
          {#each items as item (item.id)}
            <tr>
              <td class="whitespace-nowrap">{$fmt.date(item.created_at)}</td>
              <td>
                <Badge>{item.source_kind === "exam" ? $t("layoutReport.admin.kindExam") : $t("layoutReport.admin.kindExercise")}</Badge>
                {#if !item.allow_publication}<Badge severity="warning">{$t("layoutReport.admin.privateBadge")}</Badge>{/if}
              </td>
              <td class="min-w-0 break-words">{item.problem.split("\n")[0]}</td>
              <td class="break-all text-muted">{item.reporter_email}</td>
              <td class="text-right">
                <Button size="sm" variant="text" disabled={busy} onClick={() => openReport(item.id)}>{$t("layoutReport.admin.open")}</Button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </TableScroller>
  {/if}
{/if}

<Modal open={resolving} size="small" title={$t("layoutReport.admin.resolveTitle")} onClose={() => (resolving = false)}>
  <Field label={$t("layoutReport.admin.resolveNoteLabel")} hint={$t("layoutReport.admin.resolveNoteHint")}>
    {#snippet children({ id })}
      <Textarea {id} rows={3} maxlength={1000} bind:value={resolveNote} />
    {/snippet}
  </Field>
  {#snippet footer()}
    <Button variant="text" severity="secondary" onClick={() => (resolving = false)}>{$t("common.cancel")}</Button>
    <Button loading={busy} onClick={confirmResolve}>{$t("layoutReport.admin.resolveConfirm")}</Button>
  {/snippet}
</Modal>

<ConfirmDialog
  open={deleting}
  title={$t("layoutReport.admin.deleteTitle")}
  message={$t("layoutReport.admin.deleteMessage")}
  confirmText={$t("layoutReport.admin.delete")}
  cancelText={$t("common.cancel")}
  severity="danger"
  {busy}
  onConfirm={confirmDelete}
  onCancel={() => (deleting = false)}
/>
