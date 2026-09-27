<script lang="ts">
  import { t } from "$lib/i18n";
  import { Button, Modal } from "$lib/components/ui";
  import OmrParamsDiff from "./OmrParamsDiff.svelte";
  import {
    OMR_ALGORITHM_VERSION,
    diffOmrParams,
    type OmrSettingsProfile,
  } from "$lib/grading/omrSettings";
  import type { McDetectionRunSummary } from "$lib/grading/mcVerification";

  export let open = false;
  /** Newest first — `McVerificationStats.detectionRuns`. */
  export let runs: McDetectionRunSummary[];
  export let current: OmrSettingsProfile;
  export let unreviewedCount: number;
  export let reviewedCount: number;
  export let undetectedScoreCount: number;
  export let onConfirm: () => void;
  export let onCancel: () => void;

  $: latestRun = runs[0]?.run ?? null;
  $: hasDetections = runs.length > 0;
  $: changed = latestRun ? diffOmrParams(latestRun.params, current.params) : [];
  $: algorithmDiffers = !!latestRun && latestRun.algorithmVersion !== OMR_ALGORITHM_VERSION;
</script>

<Modal {open} size="md" title={$t("scanning.verify.rerunDialog.title")} onClose={onCancel}>
  <div class="flex flex-col gap-3 text-sm text-content">
    <p class="m-0">{$t("scanning.verify.rerunDialog.intro")}</p>

    <ul class="m-0 flex list-disc flex-col gap-1 pl-5">
      <li>{$t("scanning.verify.rerunDialog.willRedetect", { count: unreviewedCount })}</li>
      <li class="text-emerald-300">{$t("scanning.verify.rerunDialog.keptReviewed", { count: reviewedCount })}</li>
      {#if undetectedScoreCount > 0}
        <li class="text-emerald-300">{$t("scanning.verify.rerunDialog.keptManual", { count: undetectedScoreCount })}</li>
      {/if}
    </ul>

    {#if hasDetections}
      {#if !latestRun}
        <p class="m-0 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
          {$t("scanning.verify.rerunDialog.settingsUnknown")}
        </p>
      {:else if changed.length > 0}
        <p class="m-0 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs font-semibold text-amber-200">
          {$t("scanning.verify.rerunDialog.settingsDiffer", { count: changed.length })}
        </p>
      {:else}
        <p class="m-0 text-xs text-muted">{$t("scanning.verify.rerunDialog.sameSettings")}</p>
      {/if}
      {#if algorithmDiffers && latestRun}
        <p class="m-0 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
          {$t("scanning.verify.rerunDialog.algorithmDiffers", { version: latestRun.algorithmVersion })}
        </p>
      {/if}
      {#if !latestRun || changed.length > 0}
        <OmrParamsDiff before={latestRun?.params ?? null} after={current.params} onlyChanged />
      {/if}
    {/if}

    {#if reviewedCount > 0}
      <p class="m-0 text-xs text-muted">{$t("scanning.verify.rerunDialog.resetHint")}</p>
    {/if}
  </div>

  <svelte:fragment slot="footer">
    <Button variant="secondary" onClick={onCancel}>{$t("scanning.verify.rerunDialog.cancel")}</Button>
    <Button variant="primary" onClick={onConfirm}>{$t("scanning.verify.rerunDialog.confirm")}</Button>
  </svelte:fragment>
</Modal>
