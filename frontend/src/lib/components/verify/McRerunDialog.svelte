<script lang="ts">
  import { t } from "$lib/i18n";
  import { Alert, Button, Modal } from "$lib/components/ui";
  import OmrParamsDiff from "./OmrParamsDiff.svelte";
  import {
    diffOmrParams,
    type OmrSettingsProfile,
  } from "$lib/grading/omrSettings";
  import type { McDetectionRunSummary } from "$lib/grading/mcVerification";

  interface Props {
    open?: boolean;
    /** Newest first — `McVerificationStats.detectionRuns`. */
    runs: McDetectionRunSummary[];
    current: OmrSettingsProfile;
    unreviewedCount: number;
    reviewedCount: number;
    undetectedScoreCount: number;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open = false,
    runs,
    current,
    unreviewedCount,
    reviewedCount,
    undetectedScoreCount,
    onConfirm,
    onCancel
  }: Props = $props();

  let latestRun = $derived(runs[0]?.run ?? null);
  let hasDetections = $derived(runs.length > 0);
  // Includes `algorithm` — a different detection method shows up as a changed row.
  let changed = $derived(latestRun ? diffOmrParams(latestRun.params, current.params) : []);
</script>

<Modal {open} size="medium" title={$t("scanning.verify.rerunDialog.title")} onClose={onCancel}>
  <div class="flex flex-col gap-3 text-sm text-content">
    <p class="m-0">{$t("scanning.verify.rerunDialog.intro")}</p>

    <ul class="m-0 flex list-disc flex-col gap-1 pl-5">
      <li>{$t("scanning.verify.rerunDialog.willRedetect", { count: unreviewedCount })}</li>
      <li class="text-success-fg">{$t("scanning.verify.rerunDialog.keptReviewed", { count: reviewedCount })}</li>
      {#if undetectedScoreCount > 0}
        <li class="text-success-fg">{$t("scanning.verify.rerunDialog.keptManual", { count: undetectedScoreCount })}</li>
      {/if}
    </ul>

    {#if hasDetections}
      {#if !latestRun}
        <Alert severity="warning">{$t("scanning.verify.rerunDialog.settingsUnknown")}</Alert>
      {:else if changed.length > 0}
        <Alert severity="warning">{$t("scanning.verify.rerunDialog.settingsDiffer", { count: changed.length })}</Alert>
      {:else}
        <p class="m-0 text-xs text-muted">{$t("scanning.verify.rerunDialog.sameSettings")}</p>
      {/if}
      {#if !latestRun || changed.length > 0}
        <OmrParamsDiff before={latestRun?.params ?? null} after={current.params} onlyChanged />
      {/if}
    {/if}

    {#if reviewedCount > 0}
      <p class="m-0 text-xs text-muted">{$t("scanning.verify.rerunDialog.resetHint")}</p>
    {/if}
  </div>

  {#snippet footer()}

      <Button variant="outlined" severity="secondary" onClick={onCancel}>{$t("scanning.verify.rerunDialog.cancel")}</Button>
      <Button onClick={onConfirm}>{$t("scanning.verify.rerunDialog.confirm")}</Button>

  {/snippet}
</Modal>
