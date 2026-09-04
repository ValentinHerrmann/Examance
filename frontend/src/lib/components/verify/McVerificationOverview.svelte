<script lang="ts">
  import type { McVerificationStats } from "$lib/grading/mcVerification";
  import { t } from "$lib/i18n";

  export let stats: McVerificationStats;

  $: sortedExerciseBreakdown = [...stats.perExercise].sort((a, b) => {
    if (b.failed !== a.failed) return b.failed - a.failed;
    if (b.ambiguous !== a.ambiguous) return b.ambiguous - a.ambiguous;
    return a.exerciseLabel.localeCompare(b.exerciseLabel);
  });

  $: reviewedPercent =
    stats.totalQuestions > 0
      ? Math.round((stats.qualityStats.totalReviewed / stats.totalQuestions) * 100)
      : 0;
</script>

<div class="space-y-6 mb-8">
  <!-- Headline: how many questions still need a look — one per (submission, exercise),
       regardless of how many bubbles were ticked on any single one of them. -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <div class="rounded-lg border border-slate-700 bg-slate-800 p-4">
      <div class="text-xs font-medium text-slate-400">{$t("scanning.overview.totalGraded")}</div>
      <div class="mt-1 text-2xl font-bold text-slate-100">{stats.totalQuestions}</div>
    </div>
    <div class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
      <div class="text-xs font-medium text-emerald-400">{$t("scanning.overview.highConfidence")}</div>
      <div class="mt-1 text-2xl font-bold text-emerald-300">
        {stats.highQuestions}
        <span class="text-xs font-normal text-emerald-400/80">
          ({stats.totalQuestions > 0 ? Math.round((stats.highQuestions / stats.totalQuestions) * 100) : 0}%)
        </span>
      </div>
    </div>
    <div class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
      <div class="text-xs font-medium text-amber-400">{$t("scanning.overview.unsureAmbiguous")}</div>
      <div class="mt-1 text-2xl font-bold text-amber-300">
        {stats.ambiguousQuestions}
        <span class="text-xs font-normal text-amber-400/80">
          ({stats.totalQuestions > 0 ? Math.round((stats.ambiguousQuestions / stats.totalQuestions) * 100) : 0}%)
        </span>
      </div>
    </div>
    <div class="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
      <div class="text-xs font-medium text-red-400">{$t("scanning.overview.failedDetections")}</div>
      <div class="mt-1 text-2xl font-bold text-red-300">
        {stats.failedQuestions}
        <span class="text-xs font-normal text-red-400/80">
          ({stats.totalQuestions > 0 ? Math.round((stats.failedQuestions / stats.totalQuestions) * 100) : 0}%)
        </span>
      </div>
    </div>
  </div>

  <p class="text-xs text-slate-500">
    {$t("scanning.overview.markedBoxesSummary", { markedBoxes: stats.totalMarkedBoxes, totalQuestions: stats.totalQuestions })}
  </p>

  <!-- Quality & Calibration Section -->
  <div class="rounded-lg border border-slate-700 bg-slate-800 p-5 space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 class="text-sm font-semibold text-slate-200">{$t("scanning.overview.qualityHeading")}</h3>
        <p class="mt-0.5 text-xs text-slate-400">{$t("scanning.overview.qualityDescription")}</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-400">{$t("scanning.overview.verifiedProgress")}:</span>
        <span class="text-xs font-mono font-medium px-2 py-0.5 rounded bg-slate-700/80 text-slate-200">
          {$t("scanning.overview.verifiedProgressValue", {
            verified: stats.qualityStats.totalReviewed,
            total: stats.totalQuestions,
            percent: reviewedPercent
          })}
        </span>
      </div>
    </div>

    {#if stats.qualityStats.totalReviewed === 0}
      <div class="rounded border border-dashed border-slate-700 bg-slate-900/40 p-4 text-center">
        <p class="text-xs text-slate-400">
          {$t("scanning.overview.unverifiedNotice")}
        </p>
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- Card 1: Initial Detection Accuracy -->
        <div class="rounded-lg border border-slate-700/80 bg-slate-900/70 p-4">
          <div class="text-xs font-medium text-slate-400">
            {$t("scanning.overview.originalAccuracy")}
          </div>
          <div class="mt-1 flex items-baseline gap-2">
            <span class="text-2xl font-bold font-mono text-emerald-400">
              {stats.qualityStats.overallInitialAccuracy}%
            </span>
          </div>
          <p class="mt-1 text-[0.7rem] text-slate-500">
            {$t("scanning.overview.originalAccuracyDesc")}
          </p>
          <div class="mt-2 text-[0.75rem] font-mono text-slate-400">
            {$t("scanning.overview.confirmedCount", {
              confirmed:
                stats.qualityStats.totalReviewed -
                (stats.qualityStats.highConfidence.corrected +
                  stats.qualityStats.ambiguousConfidence.corrected +
                  stats.qualityStats.failedConfidence.corrected),
            })}
          </div>
        </div>

        <!-- Card 2: High-Confidence Calibration -->
        <div class="rounded-lg border border-slate-700/80 bg-slate-900/70 p-4">
          <div class="text-xs font-medium text-slate-400">
            {$t("scanning.overview.highConfidenceCalibration")}
          </div>
          <div class="mt-1 flex items-baseline gap-2">
            <span class="text-2xl font-bold font-mono text-sky-400">
              {stats.qualityStats.highConfidence.accuracyRate}%
            </span>
            {#if stats.qualityStats.highConfidence.reviewed > 0}
              <span class="text-xs font-mono text-slate-400">
                ({stats.qualityStats.highConfidence.confirmedUnchanged}/{stats.qualityStats.highConfidence.reviewed})
              </span>
            {/if}
          </div>
          <p class="mt-1 text-[0.7rem] text-slate-500">
            {$t("scanning.overview.highConfidenceCalibrationDesc")}
          </p>
          <div class="mt-2 text-[0.75rem] font-mono {stats.qualityStats.falseConfidenceCount > 0 ? 'text-amber-400' : 'text-slate-400'}">
            {$t("scanning.overview.falseConfidenceRate")}: {stats.qualityStats.falseConfidenceCount} ({stats.qualityStats.falseConfidenceRate}%)
          </div>
        </div>

        <!-- Card 3: Ambiguous Detections Calibration -->
        <div class="rounded-lg border border-slate-700/80 bg-slate-900/70 p-4">
          <div class="text-xs font-medium text-slate-400">
            {$t("scanning.overview.ambiguousCalibration")}
          </div>
          <div class="mt-1 flex items-baseline gap-2">
            <span class="text-2xl font-bold font-mono text-amber-400">
              {stats.qualityStats.ambiguousConfidence.reviewed > 0 ? stats.qualityStats.ambiguousConfidence.accuracyRate : 0}%
            </span>
            {#if stats.qualityStats.ambiguousConfidence.reviewed > 0}
              <span class="text-xs font-mono text-slate-400">
                ({stats.qualityStats.ambiguousConfidence.confirmedUnchanged}/{stats.qualityStats.ambiguousConfidence.reviewed})
              </span>
            {/if}
          </div>
          <p class="mt-1 text-[0.7rem] text-slate-500">
            {$t("scanning.overview.ambiguousCalibrationDesc")}
          </p>
          <div class="mt-2 text-[0.75rem] font-mono text-slate-400 flex items-center justify-between">
            <span>{$t("scanning.overview.confirmedCount", { confirmed: stats.qualityStats.ambiguousConfidence.confirmedUnchanged })}</span>
            <span class="text-slate-500">·</span>
            <span>{$t("scanning.overview.correctedCount", { corrected: stats.qualityStats.ambiguousConfidence.corrected })}</span>
          </div>
        </div>
      </div>
    {/if}
  </div>

  {#if sortedExerciseBreakdown.length > 0}
    <div class="rounded-lg border border-slate-700 bg-slate-800 overflow-hidden">
      <div class="border-b border-slate-700 px-4 py-3 bg-slate-800/80">
        <h3 class="text-sm font-semibold text-slate-200">{$t("scanning.overview.breakdownTitle")}</h3>
        <p class="mt-0.5 text-[0.7rem] text-slate-500">{$t("scanning.overview.breakdownDescription")}</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs text-slate-300">
          <thead class="bg-slate-900/60 uppercase text-slate-400 font-medium">
            <tr>
              <th class="px-4 py-2.5">{$t("scanning.overview.colQuestion")}</th>
              <th class="px-4 py-2.5 text-right text-emerald-400">{$t("scanning.overview.colHigh")}</th>
              <th class="px-4 py-2.5 text-right text-amber-400">{$t("scanning.overview.colUnsure")}</th>
              <th class="px-4 py-2.5 text-right text-red-400">{$t("scanning.overview.colFailed")}</th>
              <th class="px-4 py-2.5 text-right">{$t("scanning.overview.colTotal")}</th>
              <th class="px-4 py-2.5 text-right text-slate-500">{$t("scanning.overview.colMarks")}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-700/50">
            {#each sortedExerciseBreakdown as row}
              <tr class="hover:bg-slate-700/30 transition-colors">
                <td class="px-4 py-2.5 font-medium text-slate-200">{row.exerciseLabel}</td>
                <td class="px-4 py-2.5 text-right font-mono text-emerald-400">{row.high}</td>
                <td class="px-4 py-2.5 text-right font-mono text-amber-400">{row.ambiguous}</td>
                <td class="px-4 py-2.5 text-right font-mono text-red-400">{row.failed}</td>
                <td class="px-4 py-2.5 text-right font-mono text-slate-400">{row.total}</td>
                <td class="px-4 py-2.5 text-right font-mono text-slate-500">{row.markedBoxes}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
