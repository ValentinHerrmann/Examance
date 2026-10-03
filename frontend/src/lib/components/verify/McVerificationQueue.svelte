<script lang="ts">
  import type { McDetectionItem } from "#lib/grading/mcVerification";
  import { t } from "#lib/i18n";
  import { faChevronDown, faChevronRight, faCheck, faCircle } from "@fortawesome/free-solid-svg-icons";
  import { Badge, Button, Icon } from "#lib/components/ui";

  interface Props {
    title: string;
    items?: McDetectionItem[];
    studentProgress?: Map<string, { total: number; reviewed: number }>;
    emptyMessage: string;
    onVerifyItem: (item: McDetectionItem) => void;
    onOpenGrading: (item: McDetectionItem) => void;
  }

  let {
    title,
    items = [],
    studentProgress = new Map(),
    emptyMessage,
    onVerifyItem,
    onOpenGrading
  }: Props = $props();

  let isOpen = $state(true);
</script>

<div class="mb-6 min-w-0 overflow-hidden rounded-md border border-line bg-surface-raised">
  <button
    type="button"
    onclick={() => (isOpen = !isOpen)}
    class="w-full flex items-center justify-between px-4 py-3 bg-surface-raised hover:bg-surface-inset text-left transition-colors cursor-pointer border-b border-line"
  >
    <div class="flex items-center gap-2">
      <Icon icon={isOpen ? faChevronDown : faChevronRight} class="text-xs text-muted" />
      <h2 class="text-sm font-semibold text-content">
        {title} <span class="text-muted font-normal">({items.length})</span>
      </h2>
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
                  <span class="text-sm leading-none text-success-fg" role="img" title={$t("scanning.queue.reviewedIndicator")} aria-label={$t("scanning.queue.reviewedIndicator")}><Icon icon={faCheck} /></span>
                {:else}
                  <span class="text-sm leading-none text-muted" role="img" title={$t("scanning.queue.unreviewedIndicator")} aria-label={$t("scanning.queue.unreviewedIndicator")}><Icon icon={faCircle} class="text-xs" /></span>
                {/if}

                <div>
                  <span class="text-xs font-medium text-content">{item.studentLabel}</span>
                  {#if progress && progress.total > 1}
                    <Badge size="xs" class="ml-1 font-mono" title={$t("scanning.queue.studentProgressTooltip")}>
                      {progress.reviewed}/{progress.total}
                    </Badge>
                  {/if}
                  <span class="text-xs text-muted mx-1.5">•</span>
                  <span class="text-xs text-content">{item.exerciseLabel}</span>
                </div>

                {#if item.flaggedOptions.length > 0}
                  <Badge severity="warning" size="xs">
                    {$t("scanning.queue.flaggedOptions", { options: item.flaggedOptions.map((o) => o + 1).join(", ") })}
                  </Badge>
                {/if}

                {#if item.source === "manual"}
                  <span class="text-xs text-muted italic">{$t("scanning.queue.manual")}</span>
                {/if}
              </div>

              <div class="flex items-center gap-2 self-start sm:self-auto">
                <Button size="sm" onClick={() => onVerifyItem(item)}>{$t("scanning.queue.verifyItem")}</Button>
                <Button size="sm" variant="outlined" severity="secondary" title={$t("scanning.queue.openGrading")} onClick={() => onOpenGrading(item)}>
                  {$t("scanning.queue.canvas")}
                </Button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
