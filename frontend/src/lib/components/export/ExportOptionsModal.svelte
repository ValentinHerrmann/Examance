<script lang="ts" module>
  export interface ExportOption {
    key: string;
    label: string;
    hint?: string;
    checked?: boolean;
    disabled?: boolean;
  }
</script>

<script lang="ts">
  import { untrack, type Snippet } from "svelte";
  import { faFileZipper, faLock } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Alert, Button, Modal, OptionTile } from "#lib/components/ui";
  import type { ExportProgress, ExportResult } from "#lib/export/progress";
  import { runZipExport } from "#lib/export/runZipExport";
  import ExportOptionList from "./ExportOptionList.svelte";
  import ExportProgressBar from "./ExportProgressBar.svelte";
  import BackupFields, { backupReady } from "./BackupFields.svelte";
  import { exportBgprojArchive, type ArchiveExportOptions } from "#lib/services/archiveService";
  import { showArchiveReport } from "#lib/stores/archiveReport";

  /** The one export dialog (M4). `run` builds a readable ZIP from the chosen options; `backup` adds the re-importable, password-protected archive. With both, the teacher picks the format first. */
  interface Props {
    title: string;
    options?: ExportOption[];
    run?: (selected: Set<string>, progress: ExportProgress) => Promise<ExportResult>;
    backup?: ArchiveExportOptions;
    onBackupDone?: () => void;
    onClose: () => void;
    notice?: Snippet;
  }

  let { title, options = [], run, backup, onBackupDone, onClose, notice }: Props = $props();

  let format = $state<"zip" | "backup">(untrack(() => (run ? "zip" : "backup")));
  let password = $state("");
  let passwordRepeat = $state("");
  let withoutCode = $state(false);

  // Initial selection only; the options list is fixed while the dialog is open.
  let checked = $state<Record<string, boolean>>(
    untrack(() => Object.fromEntries(options.map((o) => [o.key, !o.disabled && (o.checked ?? true)])))
  );
  let running = $state(false);
  let step = $state("");
  let fraction = $state<number | null>(null);
  let error = $state("");
  let warnings = $state<string[]>([]);
  let finished = $state(false);

  let selected = $derived(new Set(options.filter((o) => !o.disabled && checked[o.key]).map((o) => o.key)));

  const progress: ExportProgress = (s, done, total) => {
    step = s;
    fraction = total ? Math.min(1, (done ?? 0) / total) : null;
  };

  async function start() {
    running = true;
    error = "";
    warnings = [];
    try {
      if (format === "backup") {
        progress($t("export.backup.encrypting"));
        const report = await exportBgprojArchive(password, { ...backup, includeExerciseCode: !withoutCode });
        onBackupDone?.();
        onClose();
        await showArchiveReport(report);
        return;
      }
      warnings = await runZipExport(run!, selected, progress);
      if (warnings.length) finished = true;
      else onClose();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      running = false;
    }
  }
</script>

<Modal open={true} size="medium" {title} onClose={running ? undefined : onClose} closeOnEscape={!running} {error}>
  {#if finished}
    <Alert severity="warning" title={$t("export.dialog.doneWithWarnings")}>
      <ul class="list-disc pl-5">
        {#each warnings as warning}<li>{warning}</li>{/each}
      </ul>
    </Alert>
  {:else}
    {#if run && backup}
      <fieldset class="mb-6 flex flex-col gap-2" disabled={running}>
        <legend class="mb-2 text-sm text-muted">{$t("export.dialog.format")}</legend>
        <div class="@container">
          <div class="grid grid-cols-1 gap-2 @xs:grid-cols-2">
            <OptionTile compact name="export-format" value="zip" checked={format === "zip"} icon={faFileZipper} title={$t("export.dialog.formatZip")} text={$t("export.dialog.formatZipText")} onchange={() => (format = "zip")} />
            <OptionTile compact name="export-format" value="backup" checked={format === "backup"} icon={faLock} title={$t("export.dialog.formatBackup")} text={$t("export.dialog.formatBackupText")} onchange={() => (format = "backup")} />
          </div>
        </div>
      </fieldset>
    {/if}
    {#if format === "backup"}
      <BackupFields bind:password bind:passwordRepeat bind:withoutCode disabled={running} />
    {:else}
      {@render notice?.()}
    {/if}
    {#if format === "zip" && options.length}
      <ExportOptionList {options} bind:checked disabled={running} />
    {/if}

    {#if running}
      <ExportProgressBar class="mt-6" {step} {fraction} />
    {/if}
  {/if}

  {#snippet footer()}
    {#if finished}
      <Button onClick={onClose}>{$t("common.close")}</Button>
    {:else}
      <Button variant="outlined" severity="secondary" disabled={running} onClick={onClose}>{$t("common.cancel")}</Button>
      {#if format === "backup"}
        <Button icon={faLock} loading={running} disabled={running || !backupReady(password, passwordRepeat)} onClick={start}>
          {$t("export.backup.download")}
        </Button>
      {:else}
        <Button icon={faFileZipper} loading={running} disabled={running || (options.length > 0 && selected.size === 0)} onClick={start}>
          {$t("export.dialog.download")}
        </Button>
      {/if}
    {/if}
  {/snippet}
</Modal>
