<script lang="ts">
  import { get } from "svelte/store";
  import { faCheckDouble, faRotateLeft, faShuffle } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { examChecksState } from "#lib/stores/shell";
  import { sessionStore } from "#lib/stores/session";
  import { saveExamChecks } from "#lib/exam/examChecksService";
  import { MC_SAMPLE_DEFAULT, MC_SAMPLE_PERCENTS, mcSureTarget, withMcChecks, type McSureMode } from "#lib/exam/examChecks";
  import { confirmDetections, restoreDetections } from "#lib/grading/mcBulkReview";
  import type { McCheckSummary, McDetectionItem } from "#lib/grading/mcVerification";
  import { Alert, Button, Card, ConfirmDialog, Radio, Select } from "#lib/components/ui";

  /** The MC step's progress (issue #212): open failed/unsure items, and how the sure detections are checked (every one, samples, or not at all) with a bulk "mark all as reviewed" and its undo. */
  interface Props {
    examId: string;
    summary: McCheckSummary;
    /** The sure detections not looked at yet (bulk confirm and random samples). */
    sureOpen: McDetectionItem[];
    onOpenSample: () => void;
    /** Review marks changed: the page reloads its stats. */
    onChanged: () => Promise<void> | void;
    class?: string;
  }

  let { examId, summary, sureOpen, onOpenSample, onChanged, class: className = "" }: Props = $props();

  let checks = $derived($examChecksState && $examChecksState.examId === examId ? $examChecksState.checks : null);
  let mode = $derived<McSureMode>(checks?.mc?.mode ?? "all");
  let percent = $derived(String(checks?.mc?.samplePercent ?? MC_SAMPLE_DEFAULT));
  let target = $derived(mcSureTarget(summary.sureTotal, checks?.mc));
  let sureDone = $derived(summary.sureReviewed >= target);
  let bulk = $derived(checks?.mc?.bulk ?? null);
  let busy = $state(false);
  let error = $state("");
  let confirmOpen = $state(false);
  let undoOpen = $state(false);

  async function run(work: () => Promise<void>) {
    if (busy) return;
    busy = true;
    error = "";
    try {
      await work();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  const setMc = (patch: Parameters<typeof withMcChecks>[1]) =>
    run(async () => {
      if (checks) await saveExamChecks(examId, withMcChecks(checks, patch));
    });

  const bulkConfirm = () =>
    run(async () => {
      const res = await confirmDetections(examId, get(sessionStore).sessionKey, sureOpen);
      if (checks && res.count > 0) await saveExamChecks(examId, withMcChecks(checks, { bulk: res }));
      confirmOpen = false;
      await onChanged();
    });

  const bulkUndo = () =>
    run(async () => {
      if (!bulk) return;
      await restoreDetections(examId, get(sessionStore).sessionKey, bulk.at);
      if (checks) await saveExamChecks(examId, withMcChecks(checks, { bulk: undefined }));
      undoOpen = false;
      await onChanged();
    });
</script>

<Card class={className} title={$t("scanning.verify.check.title")}>

  {#if summary.sureTotal > 0}
    <fieldset class="m-0 flex flex-col gap-2 border-0 p-0" disabled={busy || !checks}>
      <legend class="mb-2 text-sm font-medium">{$t("scanning.verify.check.modeLegend")}</legend>
      <Radio group={mode} value="all" name="mc-sure-mode" onchange={() => setMc({ mode: "all" })} label={$t("scanning.verify.check.modeAll", { total: summary.sureTotal })} />
      <div class="flex flex-wrap items-center gap-2">
        <Radio group={mode} value="sample" name="mc-sure-mode" onchange={() => setMc({ mode: "sample" })} label={$t("scanning.verify.check.modeSample")} />
        {#if mode === "sample"}
          <Select size="sm" class="w-auto" value={percent} aria-label={$t("scanning.verify.check.samplePercent")} onchange={(e) => setMc({ samplePercent: Number(e.currentTarget.value) })}>
            {#each MC_SAMPLE_PERCENTS as p (p)}<option value={String(p)}>{p} %</option>{/each}
          </Select>
          <span class="text-xs text-muted">{$t("scanning.verify.check.sampleTarget", { count: target, total: summary.sureTotal })}</span>
        {/if}
      </div>
      <Radio group={mode} value="none" name="mc-sure-mode" onchange={() => setMc({ mode: "none" })} label={$t("scanning.verify.check.modeNone")} />
    </fieldset>
    <p class="mt-2 mb-0 text-xs text-muted">{$t(`scanning.verify.check.${mode}Hint`)}</p>

    <div class="mt-4 flex flex-wrap gap-2">
      {#if sureOpen.length > 0 && mode !== "none"}
        <Button size="sm" variant="outlined" severity="secondary" icon={faShuffle} disabled={busy} onClick={onOpenSample}>{$t("scanning.verify.randomSample")}</Button>
      {/if}
      {#if sureOpen.length > 0}
        <Button size="sm" variant="outlined" severity="secondary" icon={faCheckDouble} disabled={busy || !checks} onClick={() => (confirmOpen = true)}>
          {$t("scanning.verify.check.bulk", { count: sureOpen.length })}
        </Button>
      {/if}
      {#if bulk}
        <Button size="sm" variant="text" severity="secondary" icon={faRotateLeft} disabled={busy} onClick={() => (undoOpen = true)}>
          {$t("scanning.verify.check.undo", { count: bulk.count, date: $fmt.date(bulk.at) })}
        </Button>
      {/if}
    </div>
  {/if}
  {#if error && !confirmOpen && !undoOpen}<Alert severity="danger" class="mt-3">{error}</Alert>{/if}
</Card>

<ConfirmDialog
  open={confirmOpen}
  title={$t("scanning.verify.check.bulkTitle")}
  message={$t("scanning.verify.check.bulkMessage", { count: sureOpen.length })}
  confirmText={$t("scanning.verify.check.bulkConfirm")}
  cancelText={$t("common.cancel")}
  {busy}
  {error}
  onConfirm={bulkConfirm}
  onCancel={() => (confirmOpen = false)}
/>
<ConfirmDialog
  open={undoOpen}
  title={$t("scanning.verify.check.undoTitle")}
  message={$t("scanning.verify.check.undoMessage", { count: bulk?.count ?? 0 })}
  confirmText={$t("scanning.verify.check.undoConfirm")}
  cancelText={$t("common.cancel")}
  {busy}
  {error}
  onConfirm={bulkUndo}
  onCancel={() => (undoOpen = false)}
/>
