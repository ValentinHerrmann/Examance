<script lang="ts">
  import { get } from "svelte/store";
  import { faCheckDouble, faForward, faListCheck, faRotateLeft, faShuffle } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { examChecksState } from "#lib/stores/shell";
  import { sessionStore } from "#lib/stores/session";
  import { saveExamChecks } from "#lib/exam/examChecksService";
  import { MC_SAMPLE_DEFAULT, MC_SAMPLE_PERCENTS, mcSureTarget, withMcChecks, type McSureMode } from "#lib/exam/examChecks";
  import { confirmDetections, restoreDetections } from "#lib/grading/mcBulkReview";
  import type { McCheckSummary, McDetectionItem } from "#lib/grading/mcVerification";
  import { Alert, Button, Card, ConfirmDialog, OptionTile, Select } from "#lib/components/ui";

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
      <!-- Tiles like every setting (issue #228); each mode's hint is its line. -->
      <div class="@container">
        <div class="grid grid-cols-1 gap-2 @xs:grid-cols-3">
          <OptionTile compact name="mc-sure-mode" value="all" checked={mode === "all"} icon={faListCheck} title={$t("scanning.verify.check.modeAll", { total: summary.sureTotal })} text={$t("scanning.verify.check.allHint")} onchange={() => setMc({ mode: "all" })} />
          <OptionTile compact name="mc-sure-mode" value="sample" checked={mode === "sample"} icon={faShuffle} title={$t("scanning.verify.check.modeSample")} text={$t("scanning.verify.check.sampleHint")} onchange={() => setMc({ mode: "sample" })} />
          <OptionTile compact name="mc-sure-mode" value="none" checked={mode === "none"} icon={faForward} title={$t("scanning.verify.check.modeNone")} text={$t("scanning.verify.check.noneHint")} onchange={() => setMc({ mode: "none" })} />
        </div>
      </div>
      {#if mode === "sample"}
        <div class="flex flex-wrap items-center gap-2">
          <Select size="sm" class="w-auto" value={percent} aria-label={$t("scanning.verify.check.samplePercent")} onchange={(e) => setMc({ samplePercent: Number(e.currentTarget.value) })}>
            {#each MC_SAMPLE_PERCENTS as p (p)}<option value={String(p)}>{p} %</option>{/each}
          </Select>
          <span class="text-xs text-muted">{$t("scanning.verify.check.sampleTarget", { count: target, total: summary.sureTotal })}</span>
        </div>
      {/if}
    </fieldset>

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
