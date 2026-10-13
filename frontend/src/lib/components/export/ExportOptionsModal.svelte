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
  import { faFileZipper } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Alert, Button, Checkbox, Modal } from "#lib/components/ui";
  import { downloadBlob } from "#lib/components/stats/chartExport";
  import type { ExportProgress, ExportResult } from "#lib/export/progress";

  /** Generic raw-export dialog: options as data, the caller's `run` builds the ZIP, this downloads it. */
  interface Props {
    title: string;
    options: ExportOption[];
    run: (selected: Set<string>, progress: ExportProgress) => Promise<ExportResult>;
    onClose: () => void;
    notice?: Snippet;
  }

  let { title, options, run, onClose, notice }: Props = $props();

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
      const result = await run(selected, progress);
      progress($t("export.dialog.packing"));
      downloadBlob(result.zip.toBlob(), result.fileName);
      warnings = result.warnings;
      if (!warnings.length) onClose();
      else finished = true;
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
    {@render notice?.()}
    {#if options.length}
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
        <div
          class="h-3 overflow-hidden rounded-md bg-surface-inset"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={fraction === null ? undefined : Math.round(fraction * 100)}
        >
          <div
            class="h-full bg-primary transition-[width] duration-200 {fraction === null ? 'animate-pulse' : ''}"
            style="width: {fraction === null ? 100 : fraction * 100}%"
          ></div>
        </div>
        <p class="mt-2 text-sm text-muted">{step}</p>
      </div>
    {/if}
  {/if}

  {#snippet footer()}
    {#if finished}
      <Button onClick={onClose}>{$t("common.close")}</Button>
    {:else}
      <Button variant="outlined" severity="secondary" disabled={running} onClick={onClose}>{$t("common.cancel")}</Button>
      <Button icon={faFileZipper} loading={running} disabled={running || (options.length > 0 && selected.size === 0)} onClick={start}>
        {$t("export.dialog.download")}
      </Button>
    {/if}
  {/snippet}
</Modal>
