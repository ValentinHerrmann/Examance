<script lang="ts">
  import type { McDetectionItem } from "$lib/grading/mcVerification";

  export let title: string;
  export let items: McDetectionItem[] = [];
  export let emptyMessage: string;
  export let onVerifyItem: (item: McDetectionItem) => void;
  export let onOpenGrading: (item: McDetectionItem) => void;

  let isOpen = true;
</script>

<div class="rounded-lg border border-slate-700 bg-slate-800 overflow-hidden mb-6">
  <button
    type="button"
    on:click={() => (isOpen = !isOpen)}
    class="w-full flex items-center justify-between px-4 py-3 bg-slate-800 hover:bg-slate-750 text-left transition-colors cursor-pointer border-b border-slate-700"
  >
    <div class="flex items-center gap-2">
      <span class="text-xs text-slate-400">{isOpen ? "▼" : "▶"}</span>
      <h3 class="text-sm font-semibold text-slate-200">
        {title} <span class="text-slate-400 font-normal">({items.length})</span>
      </h3>
    </div>
  </button>

  {#if isOpen}
    <div class="p-4">
      {#if items.length === 0}
        <p class="text-xs text-slate-400 italic py-2">{emptyMessage}</p>
      {:else}
        <div class="divide-y divide-slate-700/50">
          {#each items as item}
            <div class="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-3">
                {#if item.confidence === "failed"}
                  <span class="px-2 py-0.5 text-[0.7rem] font-semibold rounded bg-red-500/20 text-red-400 border border-red-500/30">
                    Failed
                  </span>
                {:else if item.confidence === "ambiguous"}
                  <span class="px-2 py-0.5 text-[0.7rem] font-semibold rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    Unsure
                  </span>
                {:else}
                  <span class="px-2 py-0.5 text-[0.7rem] font-semibold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    High
                  </span>
                {/if}

                <div>
                  <span class="text-xs font-medium text-slate-200">{item.studentLabel}</span>
                  <span class="text-xs text-slate-400 mx-1.5">•</span>
                  <span class="text-xs text-slate-300">{item.exerciseLabel}</span>
                </div>

                {#if item.flaggedOptions.length > 0}
                  <span class="text-[0.65rem] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Flagged opt: {item.flaggedOptions.map((o) => o + 1).join(", ")}
                  </span>
                {/if}

                {#if item.source === "manual"}
                  <span class="text-[0.65rem] text-slate-500 italic">Manual</span>
                {/if}
              </div>

              <div class="flex items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  on:click={() => onVerifyItem(item)}
                  class="px-2.5 py-1 text-xs font-medium rounded bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer"
                >
                  Verify Item →
                </button>
                <button
                  type="button"
                  on:click={() => onOpenGrading(item)}
                  class="px-2 py-1 text-xs font-medium rounded border border-slate-700 bg-slate-900 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                  title="Open full canvas workspace"
                >
                  Canvas ↗
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
