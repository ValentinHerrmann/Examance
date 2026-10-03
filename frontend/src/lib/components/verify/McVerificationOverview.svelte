<script lang="ts">
  import type { McVerificationStats } from "$lib/grading/mcVerification";
  import { t } from "$lib/i18n";
  import { TableScroller } from "$lib/components/ui";

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
      barColor: "bg-danger",
      textColor: "text-danger-fg",
    },
    {
      label: $t("scanning.overview.progressUnsureLabel"),
      reviewed: stats.qualityStats.ambiguousConfidence.reviewed,
      total: stats.qualityStats.ambiguousConfidence.total,
      barColor: "bg-warning",
      textColor: "text-warning-fg",
    },
    {
      label: $t("scanning.overview.progressHighLabel"),
      reviewed: stats.qualityStats.highConfidence.reviewed,
      total: stats.qualityStats.highConfidence.total,
      barColor: "bg-success",
      textColor: "text-success-fg",
    },
  ] satisfies ProgressRow[];
</script>

<div class="space-y-6 mb-8">
  <!-- Verification Progress -->
  <div class="rounded-md border border-line bg-surface-raised p-5 space-y-4">
    <h2 class="text-sm font-semibold text-content">{$t("scanning.overview.progressHeading")}</h2>

    <div class="space-y-3">
      {#each progressRows as row}
        {@const pct = row.total > 0 ? Math.round((row.reviewed / row.total) * 100) : 100}
        {@const remaining = row.total - row.reviewed}
        <div>
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="text-xs font-medium {row.textColor}">{row.label}</span>
            <span class="text-xs font-mono text-muted">
              {$t("scanning.overview.progressReviewedOf", { reviewed: row.reviewed, total: row.total })}
              {#if remaining > 0}
                <span class="ml-1.5 px-1.5 py-0.5 rounded-md bg-surface-inset/80 text-content font-semibold">
                  {$t("scanning.overview.progressRemaining", { count: remaining })}
                </span>
              {:else if row.total > 0}
                <span class="ml-1.5 px-1.5 py-0.5 rounded-md bg-success/20 text-success-fg font-semibold">
                  {$t("scanning.overview.progressDone")}
                </span>
              {/if}
            </span>
          </div>
          <div class="h-1.5 w-full rounded-full bg-surface-inset overflow-hidden">
            <div class="h-full rounded-full {row.barColor} transition-all" style="width: {pct}%"></div>
          </div>
        </div>
      {/each}
    </div>

    <p class="text-xs text-muted pt-1 border-t border-line">
      {$t("scanning.overview.progressOverall", { reviewed: stats.qualityStats.totalReviewed, total: stats.totalQuestions })}
    </p>
  </div>

  <p class="text-xs text-muted">
    {$t("scanning.overview.markedBoxesSummary", { markedBoxes: stats.totalMarkedBoxes, totalQuestions: stats.totalQuestions })}
  </p>

  <!-- Detection Calibration Section -->
  <div class="rounded-md border border-line bg-surface-raised p-5 space-y-4">
    <div>
      <h2 class="text-sm font-semibold text-content">{$t("scanning.overview.qualityHeading")}</h2>
      <p class="mt-0.5 text-xs text-muted">{$t("scanning.overview.qualityDescription")}</p>
    </div>

    {#if stats.qualityStats.totalReviewed === 0}
      <div class="rounded-md border border-dashed border-line bg-surface-sunken p-4 text-center">
        <p class="text-xs text-muted">
          {$t("scanning.overview.unverifiedNotice")}
        </p>
      </div>
    {:else}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Card 1: Initial Detection Accuracy -->
        <div class="rounded-md border border-line bg-surface-sunken p-4">
          <div class="text-xs font-medium text-muted">
            {$t("scanning.overview.originalAccuracy")}
          </div>
          <div class="mt-1 flex items-baseline gap-2">
            <span class="text-2xl font-bold font-mono text-success-fg">
              {stats.qualityStats.overallInitialAccuracy}%
            </span>
          </div>
          <p class="mt-1 text-xs text-muted">
            {$t("scanning.overview.originalAccuracyDesc")}
          </p>
          <div class="mt-2 text-xs font-mono text-muted">
            {$t("scanning.overview.confirmedCount", { confirmed: stats.qualityStats.overallConfirmedUnchanged })}
          </div>
        </div>

        <!-- Card 2: High-Confidence Calibration -->
        <div class="rounded-md border border-line bg-surface-sunken p-4">
          <div class="text-xs font-medium text-muted">
            {$t("scanning.overview.highConfidenceCalibration")}
          </div>
          <div class="mt-1 flex items-baseline gap-2">
            <span class="text-2xl font-bold font-mono text-accent">
              {stats.qualityStats.highConfidence.accuracyRate}%
            </span>
            {#if stats.qualityStats.highConfidence.reviewed > 0}
              <span class="text-xs font-mono text-muted">
                ({stats.qualityStats.highConfidence.confirmedUnchanged}/{stats.qualityStats.highConfidence.reviewed})
              </span>
            {/if}
          </div>
          <p class="mt-1 text-xs text-muted">
            {$t("scanning.overview.highConfidenceCalibrationDesc")}
          </p>
          <div class="mt-2 text-xs font-mono {stats.qualityStats.falseConfidenceCount > 0 ? 'text-warning-fg' : 'text-muted'}">
            {$t("scanning.overview.falseConfidenceRate")}: {stats.qualityStats.falseConfidenceCount} ({stats.qualityStats.falseConfidenceRate}%)
          </div>
        </div>

        <!-- Card 3: Ambiguous Detections Calibration -->
        <div class="rounded-md border border-line bg-surface-sunken p-4">
          <div class="text-xs font-medium text-muted">
            {$t("scanning.overview.ambiguousCalibration")}
          </div>
          <div class="mt-1 flex items-baseline gap-2">
            <span class="text-2xl font-bold font-mono text-warning-fg">
              {stats.qualityStats.ambiguousConfidence.reviewed > 0 ? stats.qualityStats.ambiguousConfidence.accuracyRate : 0}%
            </span>
            {#if stats.qualityStats.ambiguousConfidence.reviewed > 0}
              <span class="text-xs font-mono text-muted">
                ({stats.qualityStats.ambiguousConfidence.confirmedUnchanged}/{stats.qualityStats.ambiguousConfidence.reviewed})
              </span>
            {/if}
          </div>
          <p class="mt-1 text-xs text-muted">
            {$t("scanning.overview.ambiguousCalibrationDesc")}
          </p>
          <div class="mt-2 text-xs font-mono text-muted flex items-center justify-between">
            <span>{$t("scanning.overview.confirmedCount", { confirmed: stats.qualityStats.ambiguousConfidence.confirmedUnchanged })}</span>
            <span class="text-muted">·</span>
            <span>{$t("scanning.overview.correctedCount", { corrected: stats.qualityStats.ambiguousConfidence.corrected })}</span>
          </div>
        </div>

        <!-- Card 4: Failed Detections Calibration -->
        <div class="rounded-md border border-line bg-surface-sunken p-4">
          <div class="text-xs font-medium text-muted">
            {$t("scanning.overview.failedConfidenceCalibration")}
          </div>
          <div class="mt-1 flex items-baseline gap-2">
            <span class="text-2xl font-bold font-mono text-danger-fg">
              {stats.qualityStats.failedConfidence.reviewed > 0 ? stats.qualityStats.failedConfidence.accuracyRate : 0}%
            </span>
            {#if stats.qualityStats.failedConfidence.reviewed > 0}
              <span class="text-xs font-mono text-muted">
                ({stats.qualityStats.failedConfidence.confirmedUnchanged}/{stats.qualityStats.failedConfidence.reviewed})
              </span>
            {/if}
          </div>
          <p class="mt-1 text-xs text-muted">
            {$t("scanning.overview.failedConfidenceCalibrationDesc")}
          </p>
          <div class="mt-2 text-xs font-mono text-muted flex items-center justify-between">
            <span>{$t("scanning.overview.confirmedCount", { confirmed: stats.qualityStats.failedConfidence.confirmedUnchanged })}</span>
            <span class="text-muted">·</span>
            <span>{$t("scanning.overview.correctedCount", { corrected: stats.qualityStats.failedConfidence.corrected })}</span>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Detection Reliability Section -->
  <div class="rounded-md border border-line bg-surface-raised p-5 space-y-3">
    <div>
      <h2 class="text-sm font-semibold text-content">{$t("scanning.overview.reliabilityHeading")}</h2>
      <p class="mt-0.5 text-xs text-muted">{$t("scanning.overview.reliabilityDescription")}</p>
    </div>

    <div>
      <div class="text-xs font-semibold text-muted mb-1.5">
        {$t("scanning.overview.reliabilityReviewedGroup")}
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div class="rounded-md border border-success/30 bg-success/10 p-2.5">
          <div class="text-xs font-medium text-success-fg">{$t("scanning.overview.correctPositive")}</div>
          <div class="mt-0.5 text-lg font-bold font-mono text-success-fg">
            {stats.confusionMatrix.correctPositive.count}
            <span class="text-xs font-normal text-success-fg">({stats.confusionMatrix.correctPositive.percent}%)</span>
          </div>
        </div>
        <div class="rounded-md border border-danger/30 bg-danger/10 p-2.5">
          <div class="text-xs font-medium text-danger-fg">{$t("scanning.overview.falsePositive")}</div>
          <div class="mt-0.5 text-lg font-bold font-mono text-danger-fg">
            {stats.confusionMatrix.falsePositive.count}
            <span class="text-xs font-normal text-danger-fg">({stats.confusionMatrix.falsePositive.percent}%)</span>
          </div>
        </div>
        <div class="rounded-md border border-line bg-surface-sunken p-2.5">
          <div class="text-xs font-medium text-muted">{$t("scanning.overview.correctNegative")}</div>
          <div class="mt-0.5 text-lg font-bold font-mono text-content">
            {stats.confusionMatrix.correctNegative.count}
            <span class="text-xs font-normal text-muted">({stats.confusionMatrix.correctNegative.percent}%)</span>
          </div>
        </div>
        <div class="rounded-md border border-danger/30 bg-danger/10 p-2.5">
          <div class="text-xs font-medium text-danger-fg">{$t("scanning.overview.falseNegative")}</div>
          <div class="mt-0.5 text-lg font-bold font-mono text-danger-fg">
            {stats.confusionMatrix.falseNegative.count}
            <span class="text-xs font-normal text-danger-fg">({stats.confusionMatrix.falseNegative.percent}%)</span>
          </div>
        </div>
      </div>
    </div>

    <div>
      <div class="text-xs font-semibold text-muted mb-1.5">
        {$t("scanning.overview.reliabilityUnreviewedGroup")}
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div class="rounded-md border border-line bg-surface-sunken p-2.5">
          <div class="text-xs font-medium text-muted">{$t("scanning.overview.unreviewedPositiveHigh")}</div>
          <div class="mt-0.5 text-lg font-bold font-mono text-content">
            {stats.confusionMatrix.unreviewedPositiveHigh.count}
            <span class="text-xs font-normal text-muted">({stats.confusionMatrix.unreviewedPositiveHigh.percent}%)</span>
          </div>
        </div>
        <div class="rounded-md border border-warning/30 bg-warning/10 p-2.5">
          <div class="text-xs font-medium text-warning-fg">{$t("scanning.overview.unreviewedPositiveLow")}</div>
          <div class="mt-0.5 text-lg font-bold font-mono text-warning-fg">
            {stats.confusionMatrix.unreviewedPositiveLow.count}
            <span class="text-xs font-normal text-warning-fg">({stats.confusionMatrix.unreviewedPositiveLow.percent}%)</span>
          </div>
        </div>
        <div class="rounded-md border border-line bg-surface-sunken p-2.5">
          <div class="text-xs font-medium text-muted">{$t("scanning.overview.unreviewedNegativeHigh")}</div>
          <div class="mt-0.5 text-lg font-bold font-mono text-content">
            {stats.confusionMatrix.unreviewedNegativeHigh.count}
            <span class="text-xs font-normal text-muted">({stats.confusionMatrix.unreviewedNegativeHigh.percent}%)</span>
          </div>
        </div>
        <div class="rounded-md border border-warning/30 bg-warning/10 p-2.5">
          <div class="text-xs font-medium text-warning-fg">{$t("scanning.overview.unreviewedNegativeLow")}</div>
          <div class="mt-0.5 text-lg font-bold font-mono text-warning-fg">
            {stats.confusionMatrix.unreviewedNegativeLow.count}
            <span class="text-xs font-normal text-warning-fg">({stats.confusionMatrix.unreviewedNegativeLow.percent}%)</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  {#if sortedExerciseBreakdown.length > 0}
    <div class="rounded-md border border-line bg-surface-raised overflow-hidden">
      <div class="border-b border-line px-4 py-3 bg-surface-raised">
        <h2 class="text-sm font-semibold text-content">{$t("scanning.overview.breakdownTitle")}</h2>
        <p class="mt-0.5 text-xs text-muted">{$t("scanning.overview.breakdownDescription")}</p>
      </div>
      <TableScroller label={$t("scanning.overview.breakdownTitle")}>
        <table class="data-table data-table-compact data-table-hover text-xs">
          <thead>
            <tr>
              <th>{$t("scanning.overview.colQuestion")}</th>
              <th class="text-right text-success-fg">{$t("scanning.overview.colHigh")}</th>
              <th class="text-right text-warning-fg">{$t("scanning.overview.colUnsure")}</th>
              <th class="text-right text-danger-fg">{$t("scanning.overview.colFailed")}</th>
              <th class="text-right">{$t("scanning.overview.colTotal")}</th>
              <th class="text-right text-muted">{$t("scanning.overview.colMarks")}</th>
            </tr>
          </thead>
          <tbody>
            {#each sortedExerciseBreakdown as row}
              <tr>
                <td class="font-medium">{row.exerciseLabel}</td>
                <td class="text-right font-mono text-success-fg">{row.high}</td>
                <td class="text-right font-mono text-warning-fg">{row.ambiguous}</td>
                <td class="text-right font-mono text-danger-fg">{row.failed}</td>
                <td class="text-right font-mono text-muted">{row.total}</td>
                <td class="text-right font-mono text-muted">{row.markedBoxes}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </TableScroller>
    </div>
  {/if}
</div>
