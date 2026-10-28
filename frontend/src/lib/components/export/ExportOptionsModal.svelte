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
  import { Alert, Button, Checkbox, Field, Modal, Radio, TextInput } from "#lib/components/ui";
  import { downloadBlob } from "#lib/components/stats/chartExport";
  import type { ExportProgress, ExportResult } from "#lib/export/progress";
  import { exportBgprojArchive, type ArchiveExportOptions } from "#lib/services/archiveService";
  import { showArchiveReport } from "#lib/stores/archiveReport";

  /**
   * The one export dialog (M4). `run` builds a readable ZIP from the chosen options; `backup` adds the
   * re-importable, password-protected archive. With both, the teacher picks the format first.
   */
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
  let mismatch = $derived(passwordRepeat !== "" && password !== passwordRepeat);

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

  const progressClass =
    "block h-3 w-full appearance-none overflow-hidden rounded-md bg-surface-inset [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-surface-inset [&::-webkit-progress-value]:bg-primary";

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
      const result = await run!(selected, progress);
      progress($t("export.dialog.packing"));
      downloadBlob(result.zip.toBlob(), result.fileName);
      warnings = result.warnings;
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
        <Radio group={format} value="zip" name="export-format" onchange={() => (format = "zip")} label={$t("export.dialog.formatZip")} />
        <Radio group={format} value="backup" name="export-format" onchange={() => (format = "backup")} label={$t("export.dialog.formatBackup")} />
      </fieldset>
    {/if}
    {#if format === "backup"}
      <div class="flex flex-col gap-4">
        <p class="text-sm text-muted">{$t("export.backup.intro")}</p>
        <Field label={$t("export.backup.password")} hint={$t("export.backup.passwordHint")}>
          {#snippet children({ id })}
            <TextInput {id} type="password" autocomplete="new-password" bind:value={password} disabled={running} />
          {/snippet}
        </Field>
        <Field label={$t("export.backup.passwordRepeat")} error={mismatch ? $t("export.backup.mismatch") : undefined}>
          {#snippet children({ id })}
            <TextInput {id} type="password" autocomplete="new-password" bind:value={passwordRepeat} invalid={mismatch} disabled={running} />
          {/snippet}
        </Field>
        <div>
          <Checkbox bind:checked={withoutCode} label={$t("export.backup.withoutCode")} disabled={running} />
          <p class="ml-7 text-sm text-muted">{$t("export.backup.withoutCodeHint")}</p>
        </div>
      </div>
    {:else}
      {@render notice?.()}
    {/if}
    {#if format === "zip" && options.length}
      <fieldset class="flex flex-col gap-3" disabled={running}>
        <legend class="mb-2 text-sm text-muted">{$t("export.dialog.chooseParts")}</legend>
        {#each options as option (option.key)}
          <div>
            <Checkbox bind:checked={checked[option.key]} label={option.label} disabled={option.disabled || running} />
            {#if option.hint}<p class="ml-7 text-sm text-muted">{option.hint}</p>{/if}
          </div>
        {/each}
      </fieldset>
    {/if}

    {#if running}
      <div class="mt-6" aria-live="polite">
        <!-- No value = indeterminate (the step count is unknown, e.g. while compiling). -->
        {#if fraction === null}
          <progress class={progressClass} aria-label={step}></progress>
        {:else}
          <progress class={progressClass} aria-label={step} max="100" value={Math.round(fraction * 100)}></progress>
        {/if}
        <p class="mt-2 text-sm text-muted">{step}</p>
      </div>
    {/if}
  {/if}

  {#snippet footer()}
    {#if finished}
      <Button onClick={onClose}>{$t("common.close")}</Button>
    {:else}
      <Button variant="outlined" severity="secondary" disabled={running} onClick={onClose}>{$t("common.cancel")}</Button>
      {#if format === "backup"}
        <Button icon={faLock} loading={running} disabled={running || !password || password !== passwordRepeat} onClick={start}>
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
