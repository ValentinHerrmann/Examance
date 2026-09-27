<script lang="ts">
  import { t } from "$lib/i18n";
  import { fmt } from "$lib/utils/format";
  import { Card } from "$lib/components/ui";
  import OmrParamsDiff from "./OmrParamsDiff.svelte";
  import { diffOmrParams, type OmrSettingsProfile } from "$lib/grading/omrSettings";
  import type { McAlgorithmScore, McDetectionRunSummary } from "$lib/grading/mcVerification";

  /** Newest first, legacy (`run: null`) bucket last — `McVerificationStats.detectionRuns`. */
  export let runs: McDetectionRunSummary[];
  /** The settings a re-run would use right now. */
  export let current: OmrSettingsProfile;
  /** v2 vs v4 on the verified boxes (`McVerificationStats.algorithmComparison`). */
  export let comparison: McAlgorithmScore[] = [];

  $: latest = runs[0] ?? null;
  $: latestParams = latest?.run?.params ?? null;
  $: changed = latestParams ? diffOmrParams(latestParams, current.params) : [];
  // With nothing to compare against, show every value; otherwise lead with the differences.
  let showAll = false;
</script>

{#if latest}
  <Card class="mb-6">
    <h3 class="m-0 text-base font-semibold text-content">{$t("scanning.verify.settingsPanel.heading")}</h3>
    <p class="mt-1 mb-3 text-xs text-muted">{$t("scanning.verify.settingsPanel.description")}</p>

    <div class="mb-3 flex flex-col gap-1 text-xs text-content">
      {#if latest.run}
        <span>
          {$t("scanning.verify.settingsPanel.latestRun", {
            date: $fmt.dateTime(latest.run.detectedAt),
            trigger: $t(`scanning.verify.settingsPanel.trigger.${latest.run.trigger}`),
          })}
        </span>
        <span class="text-muted">
          {$t("scanning.verify.settingsPanel.runSettings", {
            source: $t(`settings.omr.source.${latest.run.settings.source}`),
            revision: latest.run.settings.revision,
            version: latest.run.algorithmVersion,
          })}
        </span>
      {:else}
        <span class="text-amber-300">{$t("scanning.verify.settingsPanel.notRecorded")}</span>
      {/if}
    </div>

    {#if latestParams}
      <p class="mt-0 mb-2 text-xs {changed.length > 0 ? 'font-semibold text-amber-300' : 'text-muted'}">
        {changed.length > 0
          ? $t("scanning.verify.settingsPanel.differs", { count: changed.length })
          : $t("scanning.verify.settingsPanel.noDifferences")}
      </p>
    {/if}

    {#if !latestParams || changed.length > 0 || showAll}
      <OmrParamsDiff before={latestParams} after={current.params} onlyChanged={!showAll} />
    {/if}

    <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      {#if latestParams && !showAll}
        <button type="button" class="cursor-pointer text-accent hover:underline" on:click={() => (showAll = true)}>
          {$t("scanning.verify.settingsPanel.showAll")}
        </button>
      {/if}
      <a href="/settings#omr" class="text-accent hover:underline">{$t("scanning.verify.settingsPanel.editSettings")}</a>
    </div>

    {#if comparison.length > 0}
      <div class="mt-4 border-t border-line pt-3 text-xs text-content">
        <p class="mt-0 mb-1 font-semibold">
          {$t("scanning.verify.settingsPanel.comparisonHeading", { boxes: comparison[0].boxes })}
        </p>
        <ul class="m-0 list-none p-0">
          {#each comparison as c (c.algorithm)}
            <li class={c.algorithm === current.params.algorithm ? "font-semibold" : "text-muted"}>
              {$t("scanning.verify.settingsPanel.comparisonRow", {
                algorithm: c.algorithm,
                percent: $fmt.percent(c.boxes > 0 ? c.correct / c.boxes : 0, 0),
                correct: c.correct,
                boxes: c.boxes,
                unsure: c.unsure,
              })}
            </li>
          {/each}
        </ul>
        <p class="mt-1 mb-0 text-muted">{$t("scanning.verify.settingsPanel.comparisonHint")}</p>
      </div>
    {/if}

    {#if runs.length > 1}
      <div class="mt-4 border-t border-line pt-3 text-xs text-muted">
        <p class="mt-0 mb-1">{$t("scanning.verify.settingsPanel.runsHeading")}</p>
        <ul class="m-0 list-disc pl-5">
          {#each runs as r (r.run?.runId ?? "legacy")}
            <li>
              {#if r.run}
                {$t("scanning.verify.settingsPanel.runRow", {
                  items: r.itemCount,
                  date: $fmt.dateTime(r.run.detectedAt),
                  trigger: $t(`scanning.verify.settingsPanel.trigger.${r.run.trigger}`),
                  reviewed: r.reviewedCount,
                })}
              {:else}
                {$t("scanning.verify.settingsPanel.legacyRow", { items: r.itemCount, reviewed: r.reviewedCount })}
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </Card>
{/if}
