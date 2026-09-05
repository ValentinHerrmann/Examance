<script lang="ts">
  import type { McVerificationStats } from "$lib/grading/mcVerification";
  import { t } from "$lib/i18n";

  export let stats: McVerificationStats;

  $: sortedExerciseBreakdown = [...stats.perExercise].sort((a, b) => {
    if (b.failed !== a.failed) return b.failed - a.failed;
    if (b.ambiguous !== a.ambiguous) return b.ambiguous - a.ambiguous;
    return a.exerciseLabel.localeCompare(b.exerciseLabel);
  });

  interface ProgressRow {
    label: string;
    reviewed: number;
    total: number;
    barColor: string;
    textColor: string;
  }

  $: progressRows = [
    {
      label: $t("scanning.overview.progressFailedLabel"),
      reviewed: stats.qualityStats.failedConfidence.reviewed,
      total: stats.qualityStats.failedConfidence.total,
      barColor: "bg-red-500",
      textColor: "text-red-400",
    },
    {
      label: $t("scanning.overview.progressUnsureLabel"),
      reviewed: stats.qualityStats.ambiguousConfidence.reviewed,
      total: stats.qualityStats.ambiguousConfidence.total,
      barColor: "bg-amber-500",
      textColor: "text-amber-400",
    },
    {
      label: $t("scanning.overview.progressHighLabel"),
      reviewed: stats.qualityStats.highConfidence.reviewed,
      total: stats.qualityStats.highConfidence.total,
      barColor: "bg-emerald-500",
      textColor: "text-emerald-400",
    },
  ] satisfies ProgressRow[];
</script>

<div class="space-y-6 mb-8">
  <!-- Verification Progress -->
  <div class="rounded-lg border border-slate-700 bg-slate-800 p-5 space-y-4">
    <h3 class="text-sm font-semibold text-slate-200">{$t("scanning.overview.progressHeading")}</h3>

    <div class="space-y-3">
      {#each progressRows as row}
        {@const pct = row.total > 0 ? Math.round((row.reviewed / row.total) * 100) : 100}
        {@const remaining = row.total - row.reviewed}
        <div>
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="text-xs font-medium {row.textColor}">{row.label}</span>
            <span class="text-[0.7rem] font-mono text-slate-400">
              {$t("scanning.overview.progressReviewedOf", { reviewed: row.reviewed, total: row.total })}
              {#if remaining > 0}
                <span class="ml-1.5 px-1.5 py-0.5 rounded bg-slate-700/80 text-slate-300 font-semibold">
                  {$t("scanning.overview.progressRemaining", { count: remaining })}
                </span>
              {:else if row.total > 0}
                <span class="ml-1.5 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold">
                  {$t("scanning.overview.progressDone")}
                </span>
              {/if}
            </span>
          </div>
          <div class="h-1.5 w-full rounded-full bg-slate-900/80 overflow-hidden">
            <div class="h-full rounded-full {row.barColor} transition-all" style="width: {pct}%"></div>
          </div>
        </div>
      {/each}
    </div>

    <p class="text-[0.7rem] text-slate-500 pt-1 border-t border-slate-700/70">
      {$t("scanning.overview.progressOverall", { reviewed: stats.qualityStats.totalReviewed, total: stats.totalQuestions })}
    </p>
  </div>

  <p class="text-xs text-slate-500">
    {$t("scanning.overview.markedBoxesSummary", { markedBoxes: stats.totalMarkedBoxes, totalQuestions: stats.totalQuestions })}
  </p>

  <!-- Detection Calibration Section -->
  <div class="rounded-lg border border-slate-700 bg-slate-800 p-5 space-y-4">
    <div>
      <h3 class="text-sm font-semibold text-slate-200">{$t("scanning.overview.qualityHeading")}</h3>
      <p class="mt-0.5 text-xs text-slate-400">{$t("scanning.overview.qualityDescription")}</p>
    </div>

    {#if stats.qualityStats.totalReviewed === 0}
      <div class="rounded border border-dashed border-slate-700 bg-slate-900/40 p-4 text-center">
        <p class="text-xs text-slate-400">
          {$t("scanning.overview.unverifiedNotice")}
        </p>
      </div>
    {:else}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            {$t("scanning.overview.confirmedCount", { confirmed: stats.qualityStats.overallConfirmedUnchanged })}
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

        <!-- Card 4: Failed Detections Calibration -->
        <div class="rounded-lg border border-slate-700/80 bg-slate-900/70 p-4">
          <div class="text-xs font-medium text-slate-400">
            {$t("scanning.overview.failedConfidenceCalibration")}
          </div>
          <div class="mt-1 flex items-baseline gap-2">
            <span class="text-2xl font-bold font-mono text-red-400">
              {stats.qualityStats.failedConfidence.reviewed > 0 ? stats.qualityStats.failedConfidence.accuracyRate : 0}%
            </span>
            {#if stats.qualityStats.failedConfidence.reviewed > 0}
              <span class="text-xs font-mono text-slate-400">
                ({stats.qualityStats.failedConfidence.confirmedUnchanged}/{stats.qualityStats.failedConfidence.reviewed})
              </span>
            {/if}
          </div>
          <p class="mt-1 text-[0.7rem] text-slate-500">
            {$t("scanning.overview.failedConfidenceCalibrationDesc")}
          </p>
          <div class="mt-2 text-[0.75rem] font-mono text-slate-400 flex items-center justify-between">
            <span>{$t("scanning.overview.confirmedCount", { confirmed: stats.qualityStats.failedConfidence.confirmedUnchanged })}</span>
            <span class="text-slate-500">·</span>
            <span>{$t("scanning.overview.correctedCount", { corrected: stats.qualityStats.failedConfidence.corrected })}</span>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Detection Reliability Section -->
  <div class="rounded-lg border border-slate-700 bg-slate-800 p-5 space-y-3">
    <div>
      <h3 class="text-sm font-semibold text-slate-200">{$t("scanning.overview.reliabilityHeading")}</h3>
      <p class="mt-0.5 text-xs text-slate-400">{$t("scanning.overview.reliabilityDescription")}</p>
    </div>

    <div>
      <div class="text-[0.65rem] uppercase tracking-wider text-slate-500 mb-1.5">
        {$t("scanning.overview.reliabilityReviewedGroup")}
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div class="rounded border border-emerald-500/30 bg-emerald-500/10 p-2.5">
          <div class="text-[0.65rem] font-medium text-emerald-400">{$t("scanning.overview.correctPositive")}</div>
          <div class="mt-0.5 text-lg font-bold font-mono text-emerald-300">
            {stats.confusionMatrix.correctPositive.count}
            <span class="text-[0.65rem] font-normal text-emerald-400/80">({stats.confusionMatrix.correctPositive.percent}%)</span>
          </div>
        </div>
        <div class="rounded border border-red-500/30 bg-red-500/10 p-2.5">
          <div class="text-[0.65rem] font-medium text-red-400">{$t("scanning.overview.falsePositive")}</div>
          <div class="mt-0.5 text-lg font-bold font-mono text-red-300">
            {stats.confusionMatrix.falsePositive.count}
            <span class="text-[0.65rem] font-normal text-red-400/80">({stats.confusionMatrix.falsePositive.percent}%)</span>
          </div>
        </div>
        <div class="rounded border border-slate-700/80 bg-slate-900/70 p-2.5">
          <div class="text-[0.65rem] font-medium text-slate-400">{$t("scanning.overview.correctNegative")}</div>
          <div class="mt-0.5 text-lg font-bold font-mono text-slate-300">
            {stats.confusionMatrix.correctNegative.count}
            <span class="text-[0.65rem] font-normal text-slate-500">({stats.confusionMatrix.correctNegative.percent}%)</span>
          </div>
        </div>
        <div class="rounded border border-red-500/30 bg-red-500/10 p-2.5">
          <div class="text-[0.65rem] font-medium text-red-400">{$t("scanning.overview.falseNegative")}</div>
          <div class="mt-0.5 text-lg font-bold font-mono text-red-300">
            {stats.confusionMatrix.falseNegative.count}
            <span class="text-[0.65rem] font-normal text-red-400/80">({stats.confusionMatrix.falseNegative.percent}%)</span>
          </div>
        </div>
      </div>
    </div>

    <div>
      <div class="text-[0.65rem] uppercase tracking-wider text-slate-500 mb-1.5">
        {$t("scanning.overview.reliabilityUnreviewedGroup")}
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div class="rounded border border-slate-700/80 bg-slate-900/70 p-2.5">
          <div class="text-[0.65rem] font-medium text-slate-400">{$t("scanning.overview.unreviewedPositiveHigh")}</div>
          <div class="mt-0.5 text-lg font-bold font-mono text-slate-300">
            {stats.confusionMatrix.unreviewedPositiveHigh.count}
            <span class="text-[0.65rem] font-normal text-slate-500">({stats.confusionMatrix.unreviewedPositiveHigh.percent}%)</span>
          </div>
        </div>
        <div class="rounded border border-amber-500/30 bg-amber-500/10 p-2.5">
          <div class="text-[0.65rem] font-medium text-amber-400">{$t("scanning.overview.unreviewedPositiveLow")}</div>
          <div class="mt-0.5 text-lg font-bold font-mono text-amber-300">
            {stats.confusionMatrix.unreviewedPositiveLow.count}
            <span class="text-[0.65rem] font-normal text-amber-400/80">({stats.confusionMatrix.unreviewedPositiveLow.percent}%)</span>
          </div>
        </div>
        <div class="rounded border border-slate-700/80 bg-slate-900/70 p-2.5">
          <div class="text-[0.65rem] font-medium text-slate-400">{$t("scanning.overview.unreviewedNegativeHigh")}</div>
          <div class="mt-0.5 text-lg font-bold font-mono text-slate-300">
            {stats.confusionMatrix.unreviewedNegativeHigh.count}
            <span class="text-[0.65rem] font-normal text-slate-500">({stats.confusionMatrix.unreviewedNegativeHigh.percent}%)</span>
          </div>
        </div>
        <div class="rounded border border-amber-500/30 bg-amber-500/10 p-2.5">
          <div class="text-[0.65rem] font-medium text-amber-400">{$t("scanning.overview.unreviewedNegativeLow")}</div>
          <div class="mt-0.5 text-lg font-bold font-mono text-amber-300">
            {stats.confusionMatrix.unreviewedNegativeLow.count}
            <span class="text-[0.65rem] font-normal text-amber-400/80">({stats.confusionMatrix.unreviewedNegativeLow.percent}%)</span>
          </div>
        </div>
      </div>
    </div>
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
