<script lang="ts">
  import type { McDetectionItem } from "$lib/grading/mcVerification";
  import { t } from "$lib/i18n";

  export let title: string;
  export let items: McDetectionItem[] = [];
  export let studentProgress: Map<string, { total: number; reviewed: number }> = new Map();
  export let emptyMessage: string;
  export let onVerifyItem: (item: McDetectionItem) => void;
  export let onOpenGrading: (item: McDetectionItem) => void;

  let isOpen = true;
</script>

<div class="rounded-md border border-line bg-surface-raised overflow-hidden mb-6">
  <button
    type="button"
    on:click={() => (isOpen = !isOpen)}
    class="w-full flex items-center justify-between px-4 py-3 bg-surface-raised hover:bg-surface-inset text-left transition-colors cursor-pointer border-b border-line"
  >
    <div class="flex items-center gap-2">
      <span class="text-xs text-muted">{isOpen ? "▼" : "▶"}</span>
      <h3 class="text-sm font-semibold text-content">
        {title} <span class="text-muted font-normal">({items.length})</span>
      </h3>
    </div>
  </button>

  {#if isOpen}
    <div class="p-4">
      {#if items.length === 0}
        <p class="text-xs text-muted italic py-2">{emptyMessage}</p>
      {:else}
        <div class="divide-y divide-line">
          {#each items as item}
            {@const progress = studentProgress.get(item.submissionId)}
            <div class="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-3">
                {#if item.isReviewed}
                  <span class="text-accent font-bold text-sm leading-none" title={$t("scanning.queue.reviewedIndicator")} aria-label={$t("scanning.queue.reviewedIndicator")}>✓</span>
                {:else}
                  <span class="text-muted text-sm leading-none" title={$t("scanning.queue.unreviewedIndicator")} aria-label={$t("scanning.queue.unreviewedIndicator")}>○</span>
                {/if}

                <div>
                  <span class="text-xs font-medium text-content">{item.studentLabel}</span>
                  {#if progress && progress.total > 1}
                    <span class="ml-1 px-1.5 py-0.5 text-xs font-mono font-semibold rounded-sm bg-surface-inset/60 text-content border border-line-strong" title={$t("scanning.queue.studentProgressTooltip")}>
                      {progress.reviewed}/{progress.total}
                    </span>
                  {/if}
                  <span class="text-xs text-muted mx-1.5">•</span>
                  <span class="text-xs text-content">{item.exerciseLabel}</span>
                </div>

                {#if item.flaggedOptions.length > 0}
                  <span class="text-xs px-1.5 py-0.5 rounded-sm bg-warning/10 text-warning-fg border border-warning/20">
                    {$t("scanning.queue.flaggedOptions", { options: item.flaggedOptions.map((o) => o + 1).join(", ") })}
                  </span>
                {/if}

                {#if item.source === "manual"}
                  <span class="text-xs text-muted italic">{$t("scanning.queue.manual")}</span>
                {/if}
              </div>

              <div class="flex items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  on:click={() => onVerifyItem(item)}
                  class="px-2.5 py-1 text-xs font-medium rounded-sm bg-primary hover:bg-primary text-primary-contrast transition-colors cursor-pointer"
                >
                  {$t("scanning.queue.verifyItem")}
                </button>
                <button
                  type="button"
                  on:click={() => onOpenGrading(item)}
                  class="px-2 py-1 text-xs font-medium rounded-sm border border-line bg-surface-sunken hover:bg-surface-inset text-content transition-colors cursor-pointer"
                  title={$t("scanning.queue.openGrading")}
                >
                  {$t("scanning.queue.canvas")}
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
