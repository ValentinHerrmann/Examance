<script lang="ts">
  import type { McVerificationStats } from "#lib/grading/mcVerification";
  import { t } from "#lib/i18n";

  /** How far the three MC queues are reviewed (issue #212): side by side from `md`; a queue with nothing left turns green, only open ones keep their alert colour. */
  interface Props {
    stats: McVerificationStats;
    class?: string;
  }

  let { stats, class: className = "" }: Props = $props();

  const OPEN = {
    failed: { bar: "bg-danger", text: "text-danger-fg" },
    unsure: { bar: "bg-warning", text: "text-warning-fg" },
    sure: { bar: "bg-primary", text: "text-accent" },
  } as const;
  const DONE = { bar: "bg-success", text: "text-success-fg" };

  let rows = $derived(
    (
      [
        ["failed", "scanning.overview.progressFailedLabel", stats.qualityStats.failedConfidence],
        ["unsure", "scanning.overview.progressUnsureLabel", stats.qualityStats.ambiguousConfidence],
        ["sure", "scanning.overview.progressHighLabel", stats.qualityStats.highConfidence],
      ] as const
    ).map(([kind, label, q]) => {
      const remaining = q.total - q.reviewed;
      return { kind, label, reviewed: q.reviewed, total: q.total, remaining, pct: q.total > 0 ? Math.round((q.reviewed / q.total) * 100) : 100, tone: remaining > 0 ? OPEN[kind] : DONE };
    }),
  );
</script>

<section class="min-w-0 rounded-xl bg-surface-raised p-4 shadow-sm {className}" aria-labelledby="mc-progress-title">
  <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
    <h2 id="mc-progress-title" class="m-0 text-sm font-semibold text-content">{$t("scanning.overview.progressHeading")}</h2>
    <span class="text-xs text-muted">{$t("scanning.overview.progressOverall", { reviewed: stats.qualityStats.totalReviewed, total: stats.totalQuestions })}</span>
  </div>
  <div class="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-3">
    {#each rows as row (row.kind)}
      <div class="min-w-0">
        <div class="mb-1 flex items-center justify-between gap-2 text-xs">
          <span class="font-medium {row.tone.text}">{row.label}</span>
          <span class="font-mono text-muted">
            {$t("scanning.overview.progressReviewedOf", { reviewed: row.reviewed, total: row.total })}
            {#if row.remaining > 0}
              <span class="ml-1 rounded-md bg-surface-inset px-1.5 py-0.5 font-semibold text-content">{$t("scanning.overview.progressRemaining", { count: row.remaining })}</span>
            {:else if row.total > 0}
              <span class="ml-1 rounded-md bg-success/20 px-1.5 py-0.5 font-semibold text-success-fg">{$t("scanning.overview.progressDone")}</span>
            {/if}
          </span>
        </div>
        <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-inset">
          <div class="h-full rounded-full {row.tone.bar} transition-all" style="width: {row.pct}%"></div>
        </div>
      </div>
    {/each}
  </div>
</section>
