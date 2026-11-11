<script lang="ts">
  import type { Snippet } from "svelte";
  import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
  import Checkbox from "./Checkbox.svelte";
  import Icon from "./Icon.svelte";

  /** The one list-selection toolbar (Students table, exam list, exercise library): always shown; with `onSelectAll` its checkbox reads "Select all" or the count, else `hint` or the count leads. The actions wrap to the next line as one group; greyed-out ones get their `reason` once something is selected. */
  interface Props {
    count: number;
    /** Shown instead of the count while nothing is selected; only without `onSelectAll`. */
    hint?: string;
    /** Count line, e.g. "3 selected". */
    countText: string;
    /** Number of selectable rows; with `onSelectAll` the toolbar gets its own select-all box. */
    total?: number;
    onSelectAll?: (on: boolean) => void;
    selectAllLabel?: string;
    reason?: string;
    actions: Snippet;
  }

  let { count, hint = "", countText, total = 0, onSelectAll, selectAllLabel = "", reason = "", actions }: Props = $props();
</script>

<div class="flex flex-col gap-1 rounded-md border border-line p-2 text-sm">
  <div class="flex flex-wrap items-center gap-2" role="toolbar" aria-label={hint || selectAllLabel}>
    {#if onSelectAll}
      <Checkbox
        checked={total > 0 && count === total}
        indeterminate={count > 0 && count < total}
        disabled={total === 0}
        onChange={onSelectAll}
        class="mr-2"
      >
        <span class="text-sm">{count ? countText : selectAllLabel}</span>
      </Checkbox>
    {:else}
      <span class="mr-2">{count ? countText : hint}</span>
    {/if}
    <!-- One flex item: the actions move to the next line together and wrap inside only when wider than the toolbar. -->
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      {@render actions()}
    </div>
  </div>
  {#if reason && count}
    <p class="m-0 flex items-start gap-1.5 text-muted">
      <Icon icon={faCircleInfo} class="mt-0.5 shrink-0" />{reason}
    </p>
  {/if}
</div>
