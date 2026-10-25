<script lang="ts">
  import { faBug } from "@fortawesome/free-solid-svg-icons";
  import { t, translate } from "#lib/i18n";
  import { Alert, Button, Checkbox, Field, Modal, Textarea } from "#lib/components/ui";
  import { submitLayoutReport, type LayoutReportFileData, type LayoutReportKind } from "#lib/api/layoutReports";
  import { effectiveLatexCompilation } from "#lib/stores/capabilities";
  import { frontendVersion } from "#lib/stores/versionStore";
  import { fetchRetentionPeriods } from "#lib/legal/retentionPeriods";

  /** "Report layout problem" (issue #134): button plus dialog. Consent is per report, never remembered. */
  interface Props {
    kind: LayoutReportKind;
    /** Admin-only context; never part of the GitHub text. */
    title: string;
    /** Builds the attachments from the last preview; called when the dialog opens. */
    collectFiles: () => Promise<LayoutReportFileData[]>;
    compileError?: string | null;
    disabled?: boolean;
  }

  let { kind, title, collectFiles, compileError = null, disabled = false }: Props = $props();

  let open = $state(false);
  let problem = $state("");
  let expected = $state("");
  let consent = $state(false);
  let allowPublication = $state(true);
  let files: LayoutReportFileData[] = $state.raw([]);
  let collecting = $state(false);
  let collectError = $state("");
  let sending = $state(false);
  let error = $state("");
  let sent = $state(false);
  let retentionDays: number | null = $state(null);
  let engine: "server" | "browser" = $state("browser");

  let canSend = $derived(
    consent && problem.trim() !== "" && expected.trim() !== "" && !collecting && !collectError && !sending
  );

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  async function openDialog() {
    open = true;
    sent = false;
    error = "";
    consent = false;
    allowPublication = true;
    engine = effectiveLatexCompilation() === "server" ? "server" : "browser";
    collecting = true;
    collectError = "";
    files = [];
    void fetchRetentionPeriods().then((p) => (retentionDays = p?.layoutReportDays ?? null));
    try {
      files = await collectFiles();
    } catch (err) {
      collectError = translate("layoutReport.dialog.attachmentsFailed", {
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      collecting = false;
    }
  }

  function close() {
    open = false;
    files = [];
    if (sent) {
      problem = "";
      expected = "";
    }
  }

  async function send() {
    if (!canSend) return;
    sending = true;
    error = "";
    try {
      await submitLayoutReport({
        kind,
        title,
        engine,
        appVersion: frontendVersion,
        problem: problem.trim(),
        expected: expected.trim(),
        compileError: compileError || null,
        allowPublication,
        files,
      });
      sent = true;
    } catch (err) {
      error = translate("layoutReport.dialog.failed", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      sending = false;
    }
  }
</script>

<Button size="sm" variant="text" severity="secondary" icon={faBug} {disabled} onClick={openDialog}>
  {$t("layoutReport.button")}
</Button>

<Modal {open} size="medium" title={$t("layoutReport.dialog.title")} onClose={close} {error}>
  {#if sent}
    <Alert severity="success">{$t("layoutReport.dialog.sent")}</Alert>
  {:else}
    <div class="flex flex-col gap-4">
      <p class="m-0 text-muted">{$t("layoutReport.dialog.intro")}</p>
      <Field label={$t("layoutReport.dialog.problemLabel")} required>
        {#snippet children({ id })}
          <Textarea {id} rows={3} maxlength={2000} bind:value={problem} placeholder={$t("layoutReport.dialog.problemPlaceholder")} />
        {/snippet}
      </Field>
      <Field label={$t("layoutReport.dialog.expectedLabel")} required>
        {#snippet children({ id })}
          <Textarea {id} rows={3} maxlength={2000} bind:value={expected} placeholder={$t("layoutReport.dialog.expectedPlaceholder")} />
        {/snippet}
      </Field>

      <div>
        <h3 class="m-0 mb-2 text-sm font-semibold">{$t("layoutReport.dialog.attachmentsTitle")}</h3>
        {#if collecting}
          <p class="m-0 text-sm text-muted">{$t("layoutReport.dialog.attachmentsLoading")}</p>
        {:else if collectError}
          <Alert severity="danger">{collectError}</Alert>
        {:else}
          <ul class="m-0 list-disc pl-5 text-sm text-muted">
            {#each files as file (file.filename)}
              <li class="break-all">{file.filename} ({formatSize(file.content.byteLength)})</li>
            {/each}
            {#if compileError}<li>{$t("layoutReport.dialog.compileErrorIncluded")}</li>{/if}
            <li>
              {$t("layoutReport.dialog.contextIncluded", {
                engine: engine === "server" ? $t("layoutReport.dialog.engineServer") : $t("layoutReport.dialog.engineBrowser"),
                version: frontendVersion,
              })}
            </li>
          </ul>
        {/if}
      </div>

      <div class="flex flex-col gap-2">
        <Checkbox bind:checked={consent} required label={$t("layoutReport.dialog.consent")} />
        <Checkbox bind:checked={allowPublication} label={$t("layoutReport.dialog.publication")} />
      </div>
      <p class="m-0 text-xs text-subtle">
        {$t("layoutReport.dialog.noStudentData")}
        {#if retentionDays !== null}{$t("layoutReport.dialog.retention", { days: retentionDays })}{/if}
      </p>
    </div>
  {/if}

  {#snippet footer()}
    {#if sent}
      <Button variant="solid" onClick={close}>{$t("common.close")}</Button>
    {:else}
      <Button variant="text" severity="secondary" onClick={close}>{$t("common.cancel")}</Button>
      <Button variant="solid" loading={sending} disabled={!canSend} onClick={send}>
        {sending ? $t("layoutReport.dialog.sending") : $t("layoutReport.dialog.submit")}
      </Button>
    {/if}
  {/snippet}
</Modal>
