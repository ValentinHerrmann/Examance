<script lang="ts">
  // The answer-sheet layouts pinned when the exam was printed (issue #239): scans of the printed sheets are read with them.
  import { faThumbtack } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import type { OmrTemplateCandidate } from "#lib/grading/omrTemplateChoice";
  import SectionHeading from "#lib/components/help/SectionHeading.svelte";
  import { Button, ConfirmDialog, Icon, actionIcons } from "#lib/components/ui";

  interface Props {
    /** Newest first; null while loading. */
    pins: OmrTemplateCandidate[] | null;
    /** A failed read or pin, shown in place of the list. */
    error?: string;
    /** Hash of the current layout, to mark the pin that matches it. */
    currentHash?: string;
    onRemove: (hash: string) => Promise<void>;
  }

  let { pins, error = "", currentHash, onRemove }: Props = $props();

  let removing = $state<OmrTemplateCandidate | null>(null);
  let busy = $state(false);
  let removeError = $state("");

  async function confirmRemove() {
    if (!removing) return;
    busy = true;
    removeError = "";
    try {
      await onRemove(removing.hash);
      removing = null;
    } catch (err) {
      removeError = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<section class="flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-surface-raised p-4">
  <SectionHeading id="omr-pins-label" label={$t("exam.print.pins.title")} info={$t("exam.print.pins.info")} />
  {#if error}
    <p class="m-0 text-sm text-warning-fg">{error}</p>
  {:else if pins === null}
    <p class="m-0 text-sm text-muted">{$t("exam.print.pins.loading")}</p>
  {:else if pins.length === 0}
    <p class="m-0 text-sm text-muted">{$t("exam.print.pins.none")}</p>
  {:else}
    <ul class="m-0 flex list-none flex-col gap-1 p-0" aria-labelledby="omr-pins-label">
      {#each pins as pin (pin.hash)}
        <li class="flex min-w-0 items-center gap-2 text-sm">
          <Icon icon={faThumbtack} class="shrink-0 text-muted" />
          <span class="min-w-0 flex-1">
            {$t(pin.source === "printed" ? "exam.print.pins.rowPrinted" : "exam.print.pins.rowDownload", { date: $fmt.dateTime(pin.pinnedAt ?? "") })}
            {#if pin.hash === currentHash}<span class="text-success-fg"> · {$t("exam.print.pins.current")}</span>{/if}
          </span>
          <Button size="sm" variant="text" severity="secondary" iconOnly icon={actionIcons.delete} ariaLabel={$t("exam.print.pins.remove")} title={$t("exam.print.pins.remove")} onClick={() => (removing = pin)} />
        </li>
      {/each}
    </ul>
  {/if}
</section>

<ConfirmDialog
  open={!!removing}
  title={$t("exam.print.pins.removeTitle")}
  message={$t("exam.print.pins.removeMessage", { date: $fmt.dateTime(removing?.pinnedAt ?? "") })}
  confirmText={$t("exam.print.pins.remove")}
  cancelText={$t("common.cancel")}
  severity="danger"
  role="alertdialog"
  {busy}
  error={removeError}
  onConfirm={confirmRemove}
  onCancel={() => (removing = null)}
/>
